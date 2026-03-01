/**
 * RNNoiseProcessor — AudioWorklet processor for ML-based noise suppression.
 *
 * Uses RNNoise (Xiph.org) compiled to WASM. Receives a pre-compiled WebAssembly.Module
 * via processorOptions from the main thread. Processes 480-sample frames (10ms at 48kHz)
 * with a circular buffer to convert between AudioWorklet's 128-sample blocks and RNNoise's
 * 480-sample requirement.
 *
 * Settings (enabled toggle) received via MessagePort.
 * Reports VAD probability via MessagePort after each frame.
 */
class RNNoiseProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    this._initialized = false;
    this._enabled = true;

    // RNNoise operates on 480-sample frames (10ms at 48kHz)
    this._RNNOISE_FRAME = 480;
    this._WORKLET_BLOCK = 128;
    // Buffer size: LCM(480, 128) = 1920 — holds enough for clean frame alignment
    this._BUFFER_SIZE = 1920;

    // Circular input buffer
    this._inputBuffer = new Float32Array(this._BUFFER_SIZE);
    this._inputWritePos = 0;
    this._inputReadPos = 0;
    this._inputBuffered = 0;

    // Circular output buffer
    this._outputBuffer = new Float32Array(this._BUFFER_SIZE);
    this._outputWritePos = 0;
    this._outputReadPos = 0;
    this._outputBuffered = 0;

    // Try to instantiate WASM
    try {
      const wasmModule = options.processorOptions && options.processorOptions.wasmModule;
      if (!wasmModule) {
        throw new Error('No wasmModule provided in processorOptions');
      }

      // Synchronous instantiation (~90KB WASM, well under browser sync limit)
      this._wasmInstance = new WebAssembly.Instance(wasmModule);
      const exports = this._wasmInstance.exports;

      // RNNoise C API
      this._rnnoise_create = exports.rnnoise_create;
      this._rnnoise_destroy = exports.rnnoise_destroy;
      this._rnnoise_process_frame = exports.rnnoise_process_frame;
      this._malloc = exports.malloc;
      this._free = exports.free;
      this._memory = exports.memory;

      // Create RNNoise state
      this._rnnoiseState = this._rnnoise_create(0); // null model = built-in
      if (!this._rnnoiseState) {
        throw new Error('rnnoise_create returned null');
      }

      // Allocate frame buffer in WASM memory (480 floats = 1920 bytes)
      this._framePtr = this._malloc(this._RNNOISE_FRAME * 4);
      if (!this._framePtr) {
        throw new Error('malloc failed for frame buffer');
      }

      this._initialized = true;
    } catch (err) {
      // WASM init failed — pass audio through unchanged
      this._initialized = false;
      this.port.postMessage({ type: 'error', message: 'RNNoise WASM init failed: ' + err.message });
    }

    // Listen for settings updates
    this.port.onmessage = (e) => {
      if (e.data.type === 'settings') {
        if (e.data.noiseCancellation !== undefined) {
          this._enabled = e.data.noiseCancellation;
        }
      }
    };
  }

  /**
   * Process a single RNNoise frame (480 samples).
   * RNNoise expects float input scaled to int16 range (-32768 to 32767).
   * Returns VAD probability (0.0 to 1.0).
   */
  _processRNNoiseFrame(frameData) {
    // Get a Float32Array view into WASM heap
    const heap = new Float32Array(this._memory.buffer, this._framePtr, this._RNNOISE_FRAME);

    // Scale float32 [-1, 1] to int16 range for RNNoise
    for (let i = 0; i < this._RNNOISE_FRAME; i++) {
      heap[i] = frameData[i] * 32768;
    }

    // Process in-place: rnnoise_process_frame(state, output, input)
    const vadProb = this._rnnoise_process_frame(this._rnnoiseState, this._framePtr, this._framePtr);

    // Scale back to float32 range
    for (let i = 0; i < this._RNNOISE_FRAME; i++) {
      frameData[i] = heap[i] / 32768;
    }

    return vadProb;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || !input[0] || input[0].length === 0) {
      return true;
    }

    const inputChannel = input[0];
    const outputChannel = output[0];
    const blockSize = inputChannel.length;

    // If not initialized or disabled, pass through
    if (!this._initialized || !this._enabled) {
      for (let i = 0; i < blockSize; i++) {
        outputChannel[i] = inputChannel[i];
      }
      return true;
    }

    // Write input samples to circular buffer
    for (let i = 0; i < blockSize; i++) {
      this._inputBuffer[this._inputWritePos] = inputChannel[i];
      this._inputWritePos = (this._inputWritePos + 1) % this._BUFFER_SIZE;
      this._inputBuffered++;
    }

    // Process as many RNNoise frames as available
    while (this._inputBuffered >= this._RNNOISE_FRAME) {
      // Extract 480 samples from input buffer
      const frame = new Float32Array(this._RNNOISE_FRAME);
      for (let i = 0; i < this._RNNOISE_FRAME; i++) {
        frame[i] = this._inputBuffer[this._inputReadPos];
        this._inputReadPos = (this._inputReadPos + 1) % this._BUFFER_SIZE;
      }
      this._inputBuffered -= this._RNNOISE_FRAME;

      // Run RNNoise denoising
      const vadProb = this._processRNNoiseFrame(frame);

      // Report VAD probability
      this.port.postMessage({ type: 'vad', probability: vadProb });

      // Write denoised samples to output buffer
      for (let i = 0; i < this._RNNOISE_FRAME; i++) {
        this._outputBuffer[this._outputWritePos] = frame[i];
        this._outputWritePos = (this._outputWritePos + 1) % this._BUFFER_SIZE;
        this._outputBuffered++;
      }
    }

    // Read from output buffer into the worklet output
    if (this._outputBuffered >= blockSize) {
      for (let i = 0; i < blockSize; i++) {
        outputChannel[i] = this._outputBuffer[this._outputReadPos];
        this._outputReadPos = (this._outputReadPos + 1) % this._BUFFER_SIZE;
      }
      this._outputBuffered -= blockSize;
    } else {
      // Not enough denoised data yet (startup latency) — output silence
      for (let i = 0; i < blockSize; i++) {
        outputChannel[i] = 0;
      }
    }

    return true;
  }
}

registerProcessor('rnnoise-processor', RNNoiseProcessor);
