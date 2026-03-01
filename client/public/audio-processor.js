/**
 * NexusAudioProcessor — AudioWorklet processor for real-time mic audio processing.
 *
 * Runs on the audio rendering thread, processing every 128-sample block (~2.67ms at 48kHz).
 * Implements noise gate (5-state FSM with attack, soft floor, band-pass sidechain),
 * dual-stage AGC (slow leveler + fast limiter) with noise floor tracking,
 * output gain, and speaking state detection.
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
    this._agcTarget = -20;       // dBFS (mapped to _levelerTarget)
    this._inputVolume = 1.0;     // 0.0–1.0

    // Internal parameters
    const BASE_BOOST = 1.8;      // Compensate MediaStreamDestination signal loss
    this._baseBoost = BASE_BOOST;

    // Noise gate internals
    this._gateHysteresis = 6;    // dB below threshold to close
    this._gateHoldSamples = Math.round(0.050 * sampleRate); // 50ms hold
    this._gateAttackCoeff = 1 - Math.exp(-1 / (0.002 * sampleRate)); // 2ms attack
    this._gateReleaseCoeff = 1 - Math.exp(-1 / (0.050 * sampleRate)); // 50ms release
    this._gateFloor = 0.01;      // -40dB soft floor (instead of hard mute)
    this._gateGain = 0.01;       // Current gate gain (start at floor)
    this._gateState = 'closed';  // 'closed' | 'attack' | 'open' | 'hold' | 'closing'
    this._gateHoldCounter = 0;

    // Band-pass sidechain filter (2nd-order IIR, center 1kHz, Q=0.7)
    // Precompute coefficients for Direct Form II Transposed
    const fc = 1000;
    const Q = 0.7;
    const w0 = 2 * Math.PI * fc / sampleRate;
    const sinW0 = Math.sin(w0);
    const cosW0 = Math.cos(w0);
    const alpha = sinW0 / (2 * Q);
    // Bandpass (constant skirt gain, peak = Q)
    const bpA0 = 1 + alpha;
    this._bp_b0 = (sinW0 / 2) / bpA0;
    this._bp_b1 = 0;
    this._bp_b2 = -(sinW0 / 2) / bpA0;
    this._bp_a1 = (-2 * cosW0) / bpA0;
    this._bp_a2 = (1 - alpha) / bpA0;
    this._sidechain_z1 = 0;
    this._sidechain_z2 = 0;
    this._sidechainEnvelope = 0;

    // Envelope follower (asymmetric smoothing) — full-bandwidth
    this._envelope = 0;
    this._envelopeAttackCoeff = 1 - Math.exp(-1 / (0.002 * sampleRate));  // 2ms attack
    this._envelopeReleaseCoeff = 1 - Math.exp(-1 / (0.020 * sampleRate)); // 20ms release

    // AGC — Dual-stage: slow leveler + fast limiter
    // Stage 1: Slow Leveler (brings all levels to target)
    this._levelerGain = 1.0;
    this._levelerTarget = -20;    // dBFS target (set via agcTarget)
    this._levelerBaseline = -30;  // Running input level estimate
    this._levelerAttackCoeff = 1 - Math.exp(-128 / (0.500 * sampleRate));  // 500ms per block
    this._levelerReleaseCoeff = 1 - Math.exp(-128 / (2.0 * sampleRate));   // 2s per block

    // Stage 2: Fast Limiter (catches transients)
    this._limiterGain = 1.0;
    this._limiterThreshold = -10; // dBFS
    this._limiterRatio = 4.0;
    this._limiterAttackCoeff = 1 - Math.exp(-128 / (0.005 * sampleRate));  // 5ms per block
    this._limiterReleaseCoeff = 1 - Math.exp(-128 / (0.200 * sampleRate)); // 200ms per block

    // Noise floor tracker (sliding window ~2s of blocks)
    this._noiseFloorDb = -70;
    this._noiseFloorWindow = [];
    this._noiseFloorWindowSize = Math.ceil(2.0 * sampleRate / 128);

    // AGC bounds
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
        if (s.agcTarget !== undefined) {
          this._agcTarget = s.agcTarget;
          this._levelerTarget = s.agcTarget;
        }
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

    // 1. Compute block RMS (full bandwidth)
    let sumSq = 0;
    for (let i = 0; i < blockSize; i++) {
      sumSq += inputChannel[i] * inputChannel[i];
    }
    const rms = Math.sqrt(sumSq / blockSize);
    const dbFS = rms > 1e-10 ? 20 * Math.log10(rms) : -100;

    // 2. Smooth envelope — full bandwidth (for AGC and speaking detection)
    const envCoeff = rms > this._envelope ? this._envelopeAttackCoeff : this._envelopeReleaseCoeff;
    this._envelope += envCoeff * (rms - this._envelope);
    const envelopeDb = this._envelope > 1e-10 ? 20 * Math.log10(this._envelope) : -100;

    // 3. Band-pass sidechain envelope (300Hz–3kHz speech band via 1kHz BPF)
    //    Run input through IIR bandpass and compute RMS
    let sidechainSumSq = 0;
    for (let i = 0; i < blockSize; i++) {
      const x = inputChannel[i];
      // Direct Form II Transposed
      const y = this._bp_b0 * x + this._sidechain_z1;
      this._sidechain_z1 = this._bp_b1 * x - this._bp_a1 * y + this._sidechain_z2;
      this._sidechain_z2 = this._bp_b2 * x - this._bp_a2 * y;
      sidechainSumSq += y * y;
    }
    const sidechainRms = Math.sqrt(sidechainSumSq / blockSize);
    // Smooth sidechain envelope with same attack/release
    const scCoeff = sidechainRms > this._sidechainEnvelope ? this._envelopeAttackCoeff : this._envelopeReleaseCoeff;
    this._sidechainEnvelope += scCoeff * (sidechainRms - this._sidechainEnvelope);
    const sidechainDb = this._sidechainEnvelope > 1e-10 ? 20 * Math.log10(this._sidechainEnvelope) : -100;

    // 4. Noise gate state machine (uses sidechain for open/close decisions)
    if (this._gateEnabled) {
      const openThreshold = this._gateThreshold;
      const closeThreshold = this._gateThreshold - this._gateHysteresis;

      switch (this._gateState) {
        case 'closed':
          if (sidechainDb > openThreshold) {
            this._gateState = 'attack';
          }
          break;

        case 'attack':
          if (sidechainDb < closeThreshold) {
            // Signal dropped during attack — close back down
            this._gateState = 'closing';
          } else if (this._gateGain >= 0.99) {
            // Fully ramped up
            this._gateState = 'open';
          }
          break;

        case 'open':
          if (sidechainDb < closeThreshold) {
            // Drop below hysteresis band — start hold
            this._gateState = 'hold';
            this._gateHoldCounter = this._gateHoldSamples;
          }
          break;

        case 'hold':
          this._gateHoldCounter -= blockSize;
          if (sidechainDb > openThreshold) {
            // Speech resumed during hold
            this._gateState = 'open';
          } else if (this._gateHoldCounter <= 0) {
            // Hold expired — start closing
            this._gateState = 'closing';
          }
          break;

        case 'closing':
          if (sidechainDb > openThreshold) {
            // Speech resumed during release — ramp back up via attack
            this._gateState = 'attack';
          } else if (this._gateGain <= this._gateFloor + 0.001) {
            // Reached soft floor
            this._gateState = 'closed';
            this._gateGain = this._gateFloor;
          }
          break;
      }

      // Smooth gate gain transition
      const targetGateGain = (this._gateState === 'open' || this._gateState === 'hold' || this._gateState === 'attack') ? 1.0 : this._gateFloor;
      const gateCoeff = targetGateGain > this._gateGain ? this._gateAttackCoeff : this._gateReleaseCoeff;

      // Apply per-sample smoothing for the gate gain
      for (let i = 0; i < blockSize; i++) {
        this._gateGain += gateCoeff * (targetGateGain - this._gateGain);
      }
    } else {
      // Gate disabled — fully open
      this._gateGain = 1.0;
      this._gateState = 'open';
    }

    // 5. AGC — Dual-stage leveler + limiter with noise floor tracking
    const gateIsOpen = this._gateState === 'open' || this._gateState === 'hold' || this._gateState === 'attack';

    if (this._agcEnabled) {
      // 5a. Noise floor tracking (during non-speech frames)
      if (!gateIsOpen && dbFS > -90 && dbFS < -20) {
        this._noiseFloorWindow.push(dbFS);
        if (this._noiseFloorWindow.length > this._noiseFloorWindowSize) {
          this._noiseFloorWindow.shift();
        }
        if (this._noiseFloorWindow.length >= 10) {
          // Estimate floor as 10th percentile
          const sorted = [...this._noiseFloorWindow].sort((a, b) => a - b);
          const idx = Math.floor(sorted.length * 0.1);
          this._noiseFloorDb = sorted[idx];
        }
      }

      if (gateIsOpen && dbFS > -70) {
        // 5b. Leveler — slow tracking of input level
        const levCoeff = dbFS > this._levelerBaseline ? this._levelerAttackCoeff : this._levelerReleaseCoeff;
        this._levelerBaseline += levCoeff * (dbFS - this._levelerBaseline);

        // Compute desired gain in dB domain
        let desiredGain = Math.pow(10, (this._levelerTarget - this._levelerBaseline) / 20);

        // Cap max gain based on noise floor (never boost more than target - noiseFloor - 6dB margin)
        const maxGainFromFloor = Math.pow(10, (this._levelerTarget - this._noiseFloorDb - 6) / 20);
        if (maxGainFromFloor > 0 && maxGainFromFloor < this._agcGainMax) {
          desiredGain = Math.min(desiredGain, maxGainFromFloor);
        }

        desiredGain = Math.max(this._agcGainMin, Math.min(this._agcGainMax, desiredGain));

        // Smooth leveler gain
        const levGainCoeff = desiredGain > this._levelerGain ? this._levelerAttackCoeff : this._levelerReleaseCoeff;
        this._levelerGain += levGainCoeff * (desiredGain - this._levelerGain);
        this._levelerGain = Math.max(this._agcGainMin, Math.min(this._agcGainMax, this._levelerGain));

        // 5c. Limiter — fast transient control
        const postLevelerDb = dbFS + 20 * Math.log10(this._levelerGain || 1);
        if (postLevelerDb > this._limiterThreshold) {
          // Above threshold — apply compression ratio
          const overDb = postLevelerDb - this._limiterThreshold;
          const reducedOver = overDb / this._limiterRatio;
          const targetLimiterGain = Math.pow(10, (reducedOver - overDb) / 20);
          this._limiterGain += this._limiterAttackCoeff * (targetLimiterGain - this._limiterGain);
        } else {
          // Below threshold — release back to unity
          this._limiterGain += this._limiterReleaseCoeff * (1.0 - this._limiterGain);
        }
        this._limiterGain = Math.max(0.1, Math.min(1.0, this._limiterGain));
      }
      // When gate is closed, freeze both leveler and limiter gains (don't amplify noise)
    } else {
      // AGC disabled — unity gain
      this._levelerGain = 1.0;
      this._limiterGain = 1.0;
    }

    // 6. Apply combined gain: sample * gateGain * (levelerGain * limiterGain) * inputVolume * baseBoost
    const agcGain = Math.max(this._agcGainMin, Math.min(this._agcGainMax, this._levelerGain * this._limiterGain));
    const combinedGain = this._gateGain * agcGain * this._inputVolume * this._baseBoost;

    for (let i = 0; i < blockSize; i++) {
      outputChannel[i] = inputChannel[i] * combinedGain;
    }

    // 7. Report speaking state periodically (~42ms)
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
