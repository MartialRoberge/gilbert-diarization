"""
Speaker Diarization Service - State of the Art
Uses pyannote/speaker-diarization-3.1 with optimized inference
"""

import os
import torch
import soundfile as sf
from pathlib import Path
from pyannote.audio import Pipeline
from pydub import AudioSegment
from dotenv import load_dotenv
from huggingface_hub import login

load_dotenv()


class DiarizationService:
    def __init__(self):
        self.pipeline = None
        self.device = self._get_optimal_device()

    def _get_optimal_device(self) -> torch.device:
        """Select the best available device for inference."""
        if torch.cuda.is_available():
            return torch.device("cuda")
        elif torch.backends.mps.is_available():
            # Apple Silicon GPU
            return torch.device("mps")
        return torch.device("cpu")

    def _load_pipeline(self):
        """Lazy load pipeline with optimizations."""
        if self.pipeline is None:
            hf_token = os.getenv('HF_TOKEN')
            if not hf_token:
                raise ValueError("HF_TOKEN required. Get it at https://huggingface.co/settings/tokens")

            login(token=hf_token)

            self.pipeline = Pipeline.from_pretrained(
                "pyannote/speaker-diarization-3.1"
            )
            self.pipeline.to(self.device)

            # Optimize for inference
            if self.device.type == "cuda":
                torch.backends.cudnn.benchmark = True

    def _convert_to_wav(self, input_path: str, output_path: str) -> int:
        """Convert any audio/video to mono 16kHz WAV. Returns duration in ms."""
        audio = AudioSegment.from_file(input_path)
        audio = audio.set_channels(1).set_frame_rate(16000)
        audio.export(output_path, format="wav")
        return len(audio)

    def _create_speaker_track_with_silence(
        self,
        audio: AudioSegment,
        segments: list,
        speaker: str,
        total_duration_ms: int
    ) -> AudioSegment:
        """Create a track for a speaker with silence when they're not speaking."""
        # Create silent track of full duration
        speaker_track = AudioSegment.silent(duration=total_duration_ms)

        for seg in segments:
            if seg['speaker'] == speaker:
                start_ms = int(seg['start'] * 1000)
                end_ms = int(seg['end'] * 1000)
                # Overlay the speech segment at the correct position
                segment_audio = audio[start_ms:end_ms]
                speaker_track = speaker_track.overlay(segment_audio, position=start_ms)

        return speaker_track

    @torch.inference_mode()
    def process(self, input_path: str, output_folder: str) -> dict:
        """
        Process audio file for speaker diarization.
        Returns speakers, segments, and synchronized tracks with silence.
        """
        self._load_pipeline()

        output_folder = Path(output_folder)
        output_folder.mkdir(exist_ok=True)

        # Convert to WAV
        wav_path = output_folder / "converted.wav"
        total_duration_ms = self._convert_to_wav(input_path, str(wav_path))

        # Load audio with soundfile (bypasses torchcodec issues)
        waveform, sample_rate = sf.read(str(wav_path), dtype='float32')

        # Prepare tensor for pyannote (channels, time)
        waveform_tensor = torch.from_numpy(waveform).unsqueeze(0)

        # Move to device for faster processing
        if self.device.type != "cpu":
            waveform_tensor = waveform_tensor.to(self.device)

        # Run diarization
        audio_input = {"waveform": waveform_tensor, "sample_rate": sample_rate}
        diarization = self.pipeline(audio_input)

        # Extract segments
        segments = []
        speakers = set()

        if hasattr(diarization, 'speaker_diarization'):
            for turn, speaker in diarization.speaker_diarization:
                segments.append({
                    'start': turn.start,
                    'end': turn.end,
                    'speaker': speaker
                })
                speakers.add(speaker)
        elif hasattr(diarization, 'itertracks'):
            for turn, _, speaker in diarization.itertracks(yield_label=True):
                segments.append({
                    'start': turn.start,
                    'end': turn.end,
                    'speaker': speaker
                })
                speakers.add(speaker)

        speakers = sorted(list(speakers))

        # Load audio for track extraction
        audio = AudioSegment.from_wav(str(wav_path))

        # Save original track
        original_path = output_folder / "original.wav"
        audio.export(str(original_path), format="wav")

        # Create synchronized tracks for each speaker
        tracks = [{
            'speaker': 'Original',
            'filename': 'original.wav',
            'duration': round(total_duration_ms / 1000, 2),
            'type': 'original'
        }]

        for speaker in speakers:
            track_filename = f"{speaker}.wav"
            track_path = output_folder / track_filename

            # Create track with silence (same duration as original)
            speaker_track = self._create_speaker_track_with_silence(
                audio, segments, speaker, total_duration_ms
            )
            speaker_track.export(str(track_path), format="wav")

            # Calculate speaking time
            speaking_duration = sum(
                seg['end'] - seg['start']
                for seg in segments
                if seg['speaker'] == speaker
            )

            tracks.append({
                'speaker': speaker,
                'filename': track_filename,
                'duration': round(total_duration_ms / 1000, 2),
                'speaking_time': round(speaking_duration, 2),
                'type': 'speaker'
            })

        # Cleanup converted file
        wav_path.unlink(missing_ok=True)

        return {
            'speakers': speakers,
            'segments': segments,
            'tracks': tracks,
            'total_duration': round(total_duration_ms / 1000, 2)
        }
