/* ============================================
   VIDEO.JS — WebRTC Video Manager using PeerJS
   Lettuce Family Card Game Night
   ============================================ */

class VideoManager {
    constructor() {
        this.peer = null;
        this.localStream = null;
        this.calls = {};         // peerId -> MediaConnection
        this.remoteStreams = {};  // peerId -> MediaStream
        this.peerNames = {};     // peerId -> playerName
        this.isMuted = false;
        this.isCameraOff = false;
        this.initialized = false;
    }

    /**
     * Initialize PeerJS and get local media
     * @param {string} playerId - unique player ID for this peer
     * @returns {Promise<void>}
     */
    async init(playerId) {
        if (this.initialized) return;

        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: { width: 320, height: 240, facingMode: 'user' },
                audio: true
            });
        } catch (err) {
            console.warn('Could not access camera/microphone:', err.message);
            this.localStream = null;
        }

        // Display local video
        this.displayLocalVideo();

        return new Promise((resolve, reject) => {
            this.peer = new Peer(playerId, {
                debug: 1
            });

            this.peer.on('open', (id) => {
                console.log('PeerJS connected with ID:', id);
                this.initialized = true;
                resolve();
            });

            this.peer.on('call', (call) => {
                console.log('Incoming call from:', call.peer);
                if (this.localStream) {
                    call.answer(this.localStream);
                } else {
                    call.answer();
                }
                this.handleCall(call);
            });

            this.peer.on('error', (err) => {
                console.warn('PeerJS error:', err.type, err.message);
                if (!this.initialized) {
                    this.initialized = true;
                    resolve(); // still resolve so the game works without video
                }
            });

            // Timeout fallback
            setTimeout(() => {
                if (!this.initialized) {
                    console.warn('PeerJS init timeout, continuing without video');
                    this.initialized = true;
                    resolve();
                }
            }, 5000);
        });
    }

    /**
     * Display local video in the your-video-container
     */
    displayLocalVideo() {
        const container = document.getElementById('your-video-container');
        if (!container || !this.localStream) return;

        container.innerHTML = '';
        const video = document.createElement('video');
        video.srcObject = this.localStream;
        video.autoplay = true;
        video.muted = true; // mute local playback
        video.playsInline = true;
        container.appendChild(video);
    }

    /**
     * Join a game: call all existing players
     * @param {Array} players - array of {id, name} for existing players
     */
    joinGame(players) {
        if (!this.peer || !this.initialized) return;

        players.forEach(player => {
            if (player.id !== this.peer.id && !this.calls[player.id]) {
                this.callPeer(player.id, player.name);
            }
        });
    }

    /**
     * Initiate a call to another peer
     * @param {string} peerId
     * @param {string} playerName
     */
    callPeer(peerId, playerName) {
        if (!this.peer) return;

        this.peerNames[peerId] = playerName;

        if (this.localStream) {
            const call = this.peer.call(peerId, this.localStream);
            if (call) {
                this.handleCall(call);
            }
        }
    }

    /**
     * Handle a media connection (incoming or outgoing)
     * @param {MediaConnection} call
     */
    handleCall(call) {
        this.calls[call.peer] = call;

        call.on('stream', (remoteStream) => {
            if (!this.remoteStreams[call.peer]) {
                this.remoteStreams[call.peer] = remoteStream;
                this.handleRemoteStream(call.peer, remoteStream, this.peerNames[call.peer] || 'Player');
            }
        });

        call.on('close', () => {
            this.removePeerVideo(call.peer);
            delete this.calls[call.peer];
            delete this.remoteStreams[call.peer];
        });

        call.on('error', (err) => {
            console.warn('Call error with', call.peer, err);
        });
    }

    /**
     * Display remote stream as a video feed
     * @param {string} peerId
     * @param {MediaStream} stream
     * @param {string} playerName
     */
    handleRemoteStream(peerId, stream, playerName) {
        // Add to sidebar video feeds
        const feedsContainer = document.getElementById('video-feeds');
        if (!feedsContainer) return;

        // Don't duplicate
        if (document.getElementById('video-feed-' + peerId)) return;

        const item = document.createElement('div');
        item.className = 'video-feed-item';
        item.id = 'video-feed-' + peerId;

        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;

        const nameOverlay = document.createElement('div');
        nameOverlay.className = 'video-name-overlay';
        nameOverlay.textContent = playerName;

        item.appendChild(video);
        item.appendChild(nameOverlay);
        feedsContainer.appendChild(item);

        // Also add thumbnail to player slot if exists
        this.addPlayerThumbnail(peerId, stream);
    }

    /**
     * Add a thumbnail video to a player slot in the game area
     * @param {string} peerId
     * @param {MediaStream} stream
     */
    addPlayerThumbnail(peerId, stream) {
        const thumbContainer = document.getElementById('player-video-' + peerId);
        if (!thumbContainer) return;

        thumbContainer.innerHTML = '';
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        thumbContainer.appendChild(video);
    }

    /**
     * Remove a peer's video elements
     * @param {string} peerId
     */
    removePeerVideo(peerId) {
        const feedEl = document.getElementById('video-feed-' + peerId);
        if (feedEl) feedEl.remove();

        const thumbEl = document.getElementById('player-video-' + peerId);
        if (thumbEl) thumbEl.innerHTML = '';
    }

    /**
     * Disconnect a specific peer
     * @param {string} peerId
     */
    disconnectPeer(peerId) {
        if (this.calls[peerId]) {
            this.calls[peerId].close();
            delete this.calls[peerId];
        }
        if (this.remoteStreams[peerId]) {
            delete this.remoteStreams[peerId];
        }
        this.removePeerVideo(peerId);
        delete this.peerNames[peerId];
    }

    /**
     * Disconnect all peers and stop local media
     */
    disconnectAll() {
        Object.keys(this.calls).forEach(peerId => {
            this.disconnectPeer(peerId);
        });

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        const localContainer = document.getElementById('your-video-container');
        if (localContainer) localContainer.innerHTML = '';

        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }

        this.initialized = false;
    }

    /**
     * Toggle audio mute
     * @returns {boolean} new muted state
     */
    toggleMute() {
        if (!this.localStream) return this.isMuted;

        this.isMuted = !this.isMuted;
        this.localStream.getAudioTracks().forEach(track => {
            track.enabled = !this.isMuted;
        });
        return this.isMuted;
    }

    /**
     * Toggle camera on/off
     * @returns {boolean} new camera-off state
     */
    toggleCamera() {
        if (!this.localStream) return this.isCameraOff;

        this.isCameraOff = !this.isCameraOff;
        this.localStream.getVideoTracks().forEach(track => {
            track.enabled = !this.isCameraOff;
        });
        return this.isCameraOff;
    }
}

// Export singleton
window.videoManager = new VideoManager();
