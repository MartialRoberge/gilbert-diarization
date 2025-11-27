// Couleurs des locuteurs - distinctes et professionnelles
const SPEAKER_COLORS = [
    '#1e3a5f', // Bleu foncé
    '#0d7377', // Teal foncé
    '#7c3aed', // Violet
    '#b45309', // Ambre foncé
    '#065f46', // Vert émeraude foncé
    '#9f1239', // Rose foncé
];

// État global
let currentJobId = null;
let totalDuration = 0;
let wavesurfers = {};
let segmentsData = [];
let speakersData = [];
let speakerNames = {};
let zoomLevels = {};

// Éléments DOM
const uploadZone = document.getElementById('upload-zone');
const fileInput = document.getElementById('file-input');
const uploadSection = document.getElementById('upload-section');
const progressSection = document.getElementById('progress-section');
const progressPercent = document.getElementById('progress-percent');
const progressText = document.getElementById('progress-text');
const progressBarFill = document.getElementById('progress-bar-fill');
const resultsSection = document.getElementById('results-section');
const errorSection = document.getElementById('error-section');
const errorMessage = document.getElementById('error-message');
const speakerCount = document.getElementById('speaker-count');
const segmentCount = document.getElementById('segment-count');
const totalDurationEl = document.getElementById('total-duration');
const tracksList = document.getElementById('tracks-list');
const timeline = document.getElementById('timeline');
const timelineLegend = document.getElementById('timeline-legend');
const timelineEnd = document.getElementById('timeline-end');
const downloadAllBtn = document.getElementById('download-all-btn');
const newFileBtn = document.getElementById('new-file-btn');
const retryBtn = document.getElementById('retry-btn');

// Événements
uploadZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileSelect);

uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('drag-active');
});

uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('drag-active');
});

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-active');
    if (e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
    }
});

downloadAllBtn.addEventListener('click', downloadAll);
newFileBtn.addEventListener('click', reset);
retryBtn.addEventListener('click', reset);

function handleFileSelect(e) {
    if (e.target.files[0]) {
        handleFile(e.target.files[0]);
    }
}

async function handleFile(file) {
    const allowedTypes = ['mp3', 'wav', 'mp4', 'mov', 'm4a', 'ogg', 'flac', 'webm', 'aac'];
    const extension = file.name.split('.').pop().toLowerCase();

    if (!allowedTypes.includes(extension)) {
        showError(`Format non supporté. Formats acceptés : ${allowedTypes.join(', ')}`);
        return;
    }

    showProgress();
    updateProgress(5, 'Envoi du fichier...');

    try {
        const formData = new FormData();
        formData.append('file', file);

        updateProgress(15, 'Conversion audio...');

        let fakeProgress = 15;
        const progressInterval = setInterval(() => {
            if (fakeProgress < 85) {
                fakeProgress += Math.random() * 4;
                updateProgress(fakeProgress, 'Analyse des locuteurs...');
            }
        }, 1200);

        const response = await fetch('/api/diarize', {
            method: 'POST',
            body: formData
        });

        clearInterval(progressInterval);
        updateProgress(92, 'Génération des pistes...');

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Une erreur est survenue');
        }

        updateProgress(100, 'Terminé !');

        setTimeout(() => showResults(data), 400);

    } catch (error) {
        showError(error.message);
    }
}

function showProgress() {
    uploadSection.classList.add('hidden');
    errorSection.classList.add('hidden');
    resultsSection.classList.add('hidden');
    progressSection.classList.remove('hidden');
    newFileBtn.classList.add('hidden');
}

function updateProgress(percent, text) {
    progressPercent.textContent = `${Math.round(percent)}%`;
    progressText.textContent = text;
    if (progressBarFill) {
        progressBarFill.style.width = `${percent}%`;
    }
}

function showResults(data) {
    currentJobId = data.job_id;
    totalDuration = data.total_duration || 0;
    segmentsData = data.segments || [];
    speakersData = data.speakers || [];

    speakerNames = {};
    speakersData.forEach(speaker => {
        speakerNames[speaker] = speaker;
    });

    progressSection.classList.add('hidden');
    resultsSection.classList.remove('hidden');
    newFileBtn.classList.remove('hidden');

    speakerCount.textContent = data.speakers.length;
    segmentCount.textContent = data.segments.length;
    totalDurationEl.textContent = formatTime(totalDuration);
    timelineEnd.textContent = formatTime(totalDuration);

    renderTimeline(data.segments, data.speakers, totalDuration);
    renderTracks(data.tracks, data.speakers, data.segments);
}

function renderTimeline(segments, speakers, duration) {
    if (segments.length === 0) return;

    timeline.innerHTML = '';
    const timelineDuration = duration || Math.max(...segments.map(s => s.end));

    const speakerColors = {};
    speakers.forEach((speaker, index) => {
        speakerColors[speaker] = SPEAKER_COLORS[index % SPEAKER_COLORS.length];
    });

    segments.forEach(segment => {
        const left = (segment.start / timelineDuration) * 100;
        const width = ((segment.end - segment.start) / timelineDuration) * 100;
        const color = speakerColors[segment.speaker];

        const segmentEl = document.createElement('div');
        segmentEl.className = 'timeline-segment';
        segmentEl.style.left = `${left}%`;
        segmentEl.style.width = `${Math.max(width, 0.3)}%`;
        segmentEl.style.background = color;
        segmentEl.title = `${speakerNames[segment.speaker] || segment.speaker} : ${formatTime(segment.start)} - ${formatTime(segment.end)}`;

        timeline.appendChild(segmentEl);
    });

    updateTimelineLegend(speakers);
}

function updateTimelineLegend(speakers) {
    timelineLegend.innerHTML = '';
    speakers.forEach((speaker, index) => {
        const color = SPEAKER_COLORS[index % SPEAKER_COLORS.length];
        const displayName = speakerNames[speaker] || speaker;
        const legendItem = document.createElement('div');
        legendItem.className = 'legend-item';
        legendItem.innerHTML = `
            <div class="legend-dot" style="background: ${color}"></div>
            <span>${displayName}</span>
        `;
        timelineLegend.appendChild(legendItem);
    });
}

function renderTracks(tracks, speakers, segments) {
    tracksList.innerHTML = '';

    Object.values(wavesurfers).forEach(ws => {
        if (ws && ws.destroy) {
            ws.destroy();
        }
    });
    wavesurfers = {};
    zoomLevels = {};

    const speakerColors = {};
    speakers.forEach((speaker, index) => {
        speakerColors[speaker] = SPEAKER_COLORS[index % SPEAKER_COLORS.length];
    });

    tracks.forEach((track, index) => {
        const isOriginal = track.type === 'original';
        const color = isOriginal ? '#1e3a5f' : speakerColors[track.speaker];

        const speakerSegments = isOriginal
            ? segments
            : segments.filter(s => s.speaker === track.speaker);

        const speakingPercent = track.speaking_time
            ? Math.round((track.speaking_time / track.duration) * 100)
            : 100;

        const displayName = isOriginal ? 'Audio original' : (speakerNames[track.speaker] || track.speaker);

        const trackEl = document.createElement('div');
        trackEl.className = 'track';
        trackEl.dataset.speaker = track.speaker || 'original';
        trackEl.innerHTML = `
            <button class="track-play" style="background: ${color}" data-track="${track.filename}">
                <svg class="play-icon" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="6 4 20 12 6 20 6 4"/>
                </svg>
                <svg class="pause-icon hidden" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16"/>
                    <rect x="14" y="4" width="4" height="16"/>
                </svg>
            </button>

            <div class="track-info">
                <div class="track-name">
                    ${isOriginal
                        ? `<span class="track-name-text">${displayName}</span>`
                        : `<span class="track-name-text" data-speaker="${track.speaker}" title="Cliquer pour renommer">${displayName}</span>
                           <svg class="edit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;opacity:0.4">
                               <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                               <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                           </svg>`
                    }
                </div>
                <div class="track-meta">${formatTime(track.duration)}${!isOriginal ? ` · ${speakingPercent}% de parole` : ''}</div>
            </div>

            <div class="track-waveform-container">
                <div class="track-waveform" id="waveform-${track.filename.replace('.wav', '')}" data-track="${track.filename}"></div>
                <div class="zoom-slider-container">
                    <svg class="zoom-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"/>
                        <path d="m21 21-4.35-4.35"/>
                        <path d="M11 8v6M8 11h6"/>
                    </svg>
                    <input type="range" class="zoom-slider" min="1" max="50" value="1" data-track="${track.filename}">
                    <span class="zoom-label" data-track="${track.filename}">1x</span>
                </div>
            </div>

            <div class="track-time" data-track="${track.filename}">0:00</div>

            <button class="track-download" data-filename="${track.filename}" title="Télécharger">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
            </button>
        `;

        tracksList.appendChild(trackEl);

        const containerId = `waveform-${track.filename.replace('.wav', '')}`;
        const audioUrl = `/api/download/${currentJobId}/${track.filename}`;

        zoomLevels[track.filename] = 1;

        setTimeout(() => {
            initWaveSurfer(containerId, audioUrl, track.filename, color, isOriginal ? segments : speakerSegments, speakerColors, isOriginal, track.duration);
        }, 50);

        const playBtn = trackEl.querySelector('.track-play');
        const downloadBtn = trackEl.querySelector('.track-download');
        const zoomSlider = trackEl.querySelector('.zoom-slider');
        const nameText = trackEl.querySelector('.track-name-text[data-speaker]');

        playBtn.addEventListener('click', () => togglePlay(track.filename, playBtn));
        downloadBtn.addEventListener('click', () => downloadTrack(track.filename, track.speaker));

        // Zoom slider
        zoomSlider.addEventListener('input', (e) => {
            const ws = wavesurfers[track.filename];
            if (!ws) return;

            const zoomValue = parseInt(e.target.value);
            zoomLevels[track.filename] = zoomValue;

            const container = document.getElementById(`waveform-${track.filename.replace('.wav', '')}`);
            const containerWidth = container.clientWidth;
            const duration = ws.getDuration();
            const minPxPerSec = (containerWidth / duration) * zoomValue;

            ws.zoom(minPxPerSec);

            const zoomLabel = document.querySelector(`.zoom-label[data-track="${track.filename}"]`);
            if (zoomLabel) {
                zoomLabel.textContent = `${zoomValue}x`;
            }
        });

        if (nameText) {
            nameText.addEventListener('click', () => startRename(nameText, track.speaker));
        }
    });
}

function startRename(element, speakerId) {
    const currentName = speakerNames[speakerId] || speakerId;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'track-name-input';
    input.value = currentName;

    element.replaceWith(input);
    input.focus();
    input.select();

    const finishRename = () => {
        const newName = input.value.trim() || speakerId;
        speakerNames[speakerId] = newName;

        const newSpan = document.createElement('span');
        newSpan.className = 'track-name-text';
        newSpan.dataset.speaker = speakerId;
        newSpan.title = 'Cliquer pour renommer';
        newSpan.textContent = newName;
        newSpan.addEventListener('click', () => startRename(newSpan, speakerId));

        input.replaceWith(newSpan);
        updateAllSpeakerNames(speakerId, newName);
    };

    input.addEventListener('blur', finishRename);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            input.blur();
        }
        if (e.key === 'Escape') {
            input.value = speakerNames[speakerId] || speakerId;
            input.blur();
        }
    });
}

function updateAllSpeakerNames(speakerId, newName) {
    updateTimelineLegend(speakersData);

    const timelineSegments = timeline.querySelectorAll('.timeline-segment');
    timelineSegments.forEach(seg => {
        const title = seg.title;
        if (title.startsWith(speakerId + ' :') || title.includes(speakerId)) {
            const parts = title.split(' : ');
            if (parts.length >= 2) {
                seg.title = `${newName} : ${parts.slice(1).join(' : ')}`;
            }
        }
    });
}

function initWaveSurfer(containerId, audioUrl, filename, mainColor, segments, speakerColors, isOriginal, trackDuration) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const regionsPlugin = WaveSurfer.Regions.create();

    const ws = WaveSurfer.create({
        container: container,
        waveColor: '#cbd5e1',
        progressColor: mainColor,
        cursorColor: mainColor,
        cursorWidth: 2,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        height: 64,
        normalize: true,
        minPxPerSec: 1,
        dragToSeek: true, // Activer le glisser pour naviguer
        plugins: [regionsPlugin],
    });

    ws.load(audioUrl);

    ws.on('ready', () => {
        if (isOriginal) {
            segments.forEach(seg => {
                const color = speakerColors[seg.speaker] || mainColor;
                regionsPlugin.addRegion({
                    start: seg.start,
                    end: seg.end,
                    color: hexToRgba(color, 0.3),
                    drag: false,
                    resize: false,
                });
            });
        } else {
            segments.forEach(seg => {
                regionsPlugin.addRegion({
                    start: seg.start,
                    end: seg.end,
                    color: hexToRgba(mainColor, 0.35),
                    drag: false,
                    resize: false,
                });
            });
        }

        // Setup zoom avec scroll
        setupZoomScroll(container, filename);
    });

    ws.on('timeupdate', (currentTime) => {
        const timeDisplay = document.querySelector(`.track-time[data-track="${filename}"]`);
        if (timeDisplay) {
            timeDisplay.textContent = formatTime(currentTime);
        }
    });

    ws.on('finish', () => {
        const btn = document.querySelector(`.track-play[data-track="${filename}"]`);
        if (btn) {
            btn.querySelector('.play-icon').classList.remove('hidden');
            btn.querySelector('.pause-icon').classList.add('hidden');
        }
    });

    ws.on('interaction', () => {
        const btn = document.querySelector(`.track-play[data-track="${filename}"]`);
        if (btn && ws.isPlaying()) {
            btn.querySelector('.play-icon').classList.add('hidden');
            btn.querySelector('.pause-icon').classList.remove('hidden');
        }
    });

    wavesurfers[filename] = ws;
}

function setupZoomScroll(container, filename) {
    container.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();

            const ws = wavesurfers[filename];
            if (!ws) return;

            const delta = e.deltaY > 0 ? -1 : 1;
            let currentZoom = zoomLevels[filename] || 1;

            if (delta > 0) {
                currentZoom = Math.min(currentZoom + 2, 50);
            } else {
                currentZoom = Math.max(currentZoom - 2, 1);
            }

            zoomLevels[filename] = currentZoom;

            const containerWidth = container.clientWidth;
            const duration = ws.getDuration();
            const minPxPerSec = (containerWidth / duration) * currentZoom;

            ws.zoom(minPxPerSec);

            // Mettre à jour le slider et le label
            const zoomSlider = document.querySelector(`.zoom-slider[data-track="${filename}"]`);
            const zoomLabel = document.querySelector(`.zoom-label[data-track="${filename}"]`);

            if (zoomSlider) zoomSlider.value = currentZoom;
            if (zoomLabel) zoomLabel.textContent = `${currentZoom}x`;
        }
    }, { passive: false });
}

function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function togglePlay(filename, btn) {
    const ws = wavesurfers[filename];
    if (!ws) return;

    const playIcon = btn.querySelector('.play-icon');
    const pauseIcon = btn.querySelector('.pause-icon');

    Object.entries(wavesurfers).forEach(([key, player]) => {
        if (key !== filename && player.isPlaying()) {
            player.pause();
            const otherBtn = document.querySelector(`.track-play[data-track="${key}"]`);
            if (otherBtn) {
                otherBtn.querySelector('.play-icon').classList.remove('hidden');
                otherBtn.querySelector('.pause-icon').classList.add('hidden');
            }
        }
    });

    if (ws.isPlaying()) {
        ws.pause();
        playIcon.classList.remove('hidden');
        pauseIcon.classList.add('hidden');
    } else {
        ws.play();
        playIcon.classList.add('hidden');
        pauseIcon.classList.remove('hidden');
    }
}

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

async function downloadTrack(filename, speaker) {
    // Déterminer le nom du fichier à télécharger
    let downloadName = filename;
    if (speaker && speaker !== 'original') {
        const customName = speakerNames[speaker] || speaker;
        downloadName = customName;
    } else if (filename === 'original.wav') {
        downloadName = 'original';
    }

    try {
        const response = await fetch(`/api/download/${currentJobId}/${filename}?name=${encodeURIComponent(downloadName)}`);
        if (!response.ok) throw new Error('Erreur de téléchargement');

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = downloadName.endsWith('.wav') ? downloadName : `${downloadName}.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Download error:', error);
    }
}

async function downloadAll() {
    // Créer le mapping des noms
    const names = {
        'original': 'original'
    };
    Object.keys(speakerNames).forEach(speaker => {
        names[speaker] = speakerNames[speaker];
    });

    try {
        const response = await fetch(`/api/download-all/${currentJobId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ names })
        });

        if (!response.ok) throw new Error('Erreur de téléchargement');

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'speakers.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Download error:', error);
    }
}

function showError(message) {
    progressSection.classList.add('hidden');
    resultsSection.classList.add('hidden');
    uploadSection.classList.add('hidden');
    errorSection.classList.remove('hidden');
    errorMessage.textContent = message;
    newFileBtn.classList.remove('hidden');
}

function reset() {
    Object.values(wavesurfers).forEach(ws => {
        if (ws && ws.destroy) {
            ws.destroy();
        }
    });
    wavesurfers = {};
    speakerNames = {};
    zoomLevels = {};

    if (currentJobId) {
        fetch(`/api/cleanup/${currentJobId}`, { method: 'DELETE' }).catch(() => {});
        currentJobId = null;
    }

    fileInput.value = '';
    progressSection.classList.add('hidden');
    resultsSection.classList.add('hidden');
    errorSection.classList.add('hidden');
    uploadSection.classList.remove('hidden');
    newFileBtn.classList.add('hidden');
}

window.addEventListener('beforeunload', () => {
    Object.values(wavesurfers).forEach(ws => {
        if (ws && ws.destroy) {
            ws.destroy();
        }
    });
    if (currentJobId) {
        navigator.sendBeacon(`/api/cleanup/${currentJobId}`);
    }
});
