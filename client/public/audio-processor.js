/**
 * NexusAudioProcessor — AudioWorklet processor for real-time mic audio processing.
 *
 * Runs on the audio rendering thread, processing every 128-sample block (~2.67ms at 48kHz).
 * Implements noise gate (with hold + hysteresis), noise-aware AGC, output gain,
 * and speaking state detection.
 *
 * Settings are received via MessagePort from the main thread.
 * Speaking state is reported back via MessagePort every ~42ms.
 */
class NexusAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // User-facing settings (updated via port messages)
    this._gateEnabled = true;
    this._gateThreshold = -50;   // dBFS
    this._agcEnabled = false;
    this._agcTarget = -20;       // dBFS
    this._inputVolume = 1.0;     // 0.0–1.0

    // Internal parameters
    const BASE_BOOST = 1.8;      // Compensate MediaStreamDestination signal loss
    this._baseBoost = BASE_BOOST;

    // Noise gate internals
    this._gateHysteresis = 6;    // dB below threshold to close
    this._gateHoldSamples = Math.round(0.150 * sampleRate); // 150ms in samples
    this._gateAttackCoeff = 1 - Math.exp(-1 / (0.005 * sampleRate)); // 5ms
    this._gateReleaseCoeff = 1 - Math.exp(-1 / (0.050 * sampleRate)); // 50ms
    this._gateGain = 0;          // Current gate gain (0 = closed, 1 = open)
    this._gateState = 'closed';  // 'open' | 'hold' | 'closing' | 'closed'
    this._gateHoldCounter = 0;

    // Envelope follower (asymmetric smoothing)
    this._envelope = 0;
    this._envelopeAttackCoeff = 1 - Math.exp(-1 / (0.002 * sampleRate));  // 2ms attack
    this._envelopeReleaseCoeff = 1 - Math.exp(-1 / (0.020 * sampleRate)); // 20ms release

    // AGC internals
    this._agcGain = 1.0;
    this._agcBaseline = -30;     // dBFS, initial estimate
    this._agcSlowCoeff = 1 - Math.exp(-128 / (2.0 * sampleRate));   // 2s time constant per block
    this._agcFastCoeff = 1 - Math.exp(-128 / (0.100 * sampleRate)); // 100ms time constant per block
    this._agcGainMin = 0.2;
    this._agcGainMax = 8.0;

    // Speaking detection — report every ~42ms (16 blocks at 48kHz)
    this._speakingReportInterval = 16;
    this._speakingBlockCounter = 0;
    this._isSpeaking = false;

    // Listen for settings updates from main thread
    this.port.onmessage = (e) => {
      if (e.data.type === 'settings') {
        const s = e.data;
        if (s.gateEnabled !== undefined) this._gateEnabled = s.gateEnabled;
        if (s.gateThreshold !== undefined) this._gateThreshold = s.gateThreshold;
        if (s.agcEnabled !== undefined) this._agcEnabled = s.agcEnabled;
        if (s.agcTarget !== undefined) this._agcTarget = s.agcTarget;
        if (s.inputVolume !== undefined) this._inputVolume = s.inputVolume;
      }
    };
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

    // 1. Compute block RMS
    let sumSq = 0;
    for (let i = 0; i < blockSize; i++) {
      sumSq += inputChannel[i] * inputChannel[i];
    }
    const rms = Math.sqrt(sumSq / blockSize);
    const dbFS = rms > 1e-10 ? 20 * Math.log10(rms) : -100;

    // 2. Smooth envelope (asymmetric: fast attack, slower release)
    const envCoeff = rms > this._envelope ? this._envelopeAttackCoeff : this._envelopeReleaseCoeff;
    this._envelope += envCoeff * (rms - this._envelope);
    const envelopeDb = this._envelope > 1e-10 ? 20 * Math.log10(this._envelope) : -100;

    // 3. Noise gate state machine
    if (this._gateEnabled) {
      const openThreshold = this._gateThreshold;
      const closeThreshold = this._gateThreshold - this._gateHysteresis;

      switch (this._gateState) {
        case 'closed':
          if (envelopeDb > openThreshold) {
            this._gateState = 'open';
          }
          break;

        case 'open':
          if (envelopeDb < closeThreshold) {
            // Drop below hysteresis band — start hold
            this._gateState = 'hold';
            this._gateHoldCounter = this._gateHoldSamples;
          }
          break;

        case 'hold':
          this._gateHoldCounter -= blockSize;
          if (envelopeDb > openThreshold) {
            // Speech resumed during hold
            this._gateState = 'open';
          } else if (this._gateHoldCounter <= 0) {
            // Hold expired — start closing
            this._gateState = 'closing';
          }
          break;

        case 'closing':
          if (envelopeDb > openThreshold) {
            // Speech resumed during release
            this._gateState = 'open';
          } else if (this._gateGain < 0.001) {
            // Fully closed
            this._gateState = 'closed';
            this._gateGain = 0;
          }
          break;
      }

      // Smooth gate gain transition
      const targetGateGain = (this._gateState === 'open' || this._gateState === 'hold') ? 1.0 : 0.0;
      const gateCoeff = targetGateGain > this._gateGain ? this._gateAttackCoeff : this._gateReleaseCoeff;

      // Apply per-sample smoothing for the gate gain
      // Use block-level approximation: multiple steps of the exponential filter
      for (let i = 0; i < blockSize; i++) {
        this._gateGain += gateCoeff * (targetGateGain - this._gateGain);
      }
    } else {
      // Gate disabled — fully open
      this._gateGain = 1.0;
      this._gateState = 'open';
    }

    // 4. AGC (only when gate is open AND signal is above noise floor)
    const gateIsOpen = this._gateState === 'open' || this._gateState === 'hold';

    if (this._agcEnabled) {
      if (gateIsOpen && dbFS > -70) {
        // Update slow baseline tracking
        this._agcBaseline += this._agcSlowCoeff * (dbFS - this._agcBaseline);

        // Compute desired gain (dB-correct conversion)
        const desiredGain = Math.pow(10, (this._agcTarget - this._agcBaseline) / 20);
        const clampedDesired = Math.max(this._agcGainMin, Math.min(this._agcGainMax, desiredGain));

        // Dual-speed convergence
        const gainDiffDb = Math.abs(20 * Math.log10(clampedDesired / (this._agcGain || 1)));
        const agcCoeff = gainDiffDb > 3 ? this._agcFastCoeff : this._agcSlowCoeff;

        this._agcGain += agcCoeff * (clampedDesired - this._agcGain);
        this._agcGain = Math.max(this._agcGainMin, Math.min(this._agcGainMax, this._agcGain));
      }
      // When gate is closed, freeze AGC gain (don't amplify noise)
    } else {
      // AGC disabled — unity gain
      this._agcGain = 1.0;
    }

    // 5. Apply combined gain: sample * gateGain * agcGain * inputVolume * baseBoost
    const combinedGain = this._gateGain * this._agcGain * this._inputVolume * this._baseBoost;

    for (let i = 0; i < blockSize; i++) {
      outputChannel[i] = inputChannel[i] * combinedGain;
    }

    // 6. Report speaking state periodically (~42ms)
    this._speakingBlockCounter++;
    if (this._speakingBlockCounter >= this._speakingReportInterval) {
      this._speakingBlockCounter = 0;
      const newSpeaking = gateIsOpen && envelopeDb > (this._gateThreshold - 3);
      if (newSpeaking !== this._isSpeaking) {
        this._isSpeaking = newSpeaking;
        this.port.postMessage({ type: 'speaking', isSpeaking: newSpeaking });
      }
    }

    return true;
  }
}

registerProcessor('nexus-audio-processor', NexusAudioProcessor);
