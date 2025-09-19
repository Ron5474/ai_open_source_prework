class GameClient {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.worldImage = null;
        this.worldWidth = 2048;
        this.worldHeight = 2048;
        
        // Game state
        this.myPlayerId = null;
        this.players = {};
        this.avatars = {};
        this.isConnected = false;
        
        // Viewport management
        this.viewportX = 0;
        this.viewportY = 0;
        
        // WebSocket
        this.ws = null;
        
        // Movement state
        this.pressedKeys = {};
        this.isMoving = false;
        this.movementInterval = null;
        
        // Smooth movement
        this.interpolatedPlayers = {};
        this.animationId = null;
        
        // Chat system
        this.chatMessages = [];
        this.maxChatMessages = 50;
        
        // Mini-map
        this.miniMapCanvas = null;
        this.miniMapCtx = null;
        this.miniMapSize = 200;
        
        this.init();
    }
    
    init() {
        this.setupCanvas();
        this.loadWorldMap();
        this.setupKeyboardControls();
        this.setupChat();
        this.setupMiniMap();
        // this.startSmoothMovement(); // Temporarily disabled
        this.connectToServer();
    }
    
    setupCanvas() {
        // Set canvas size to fill the browser window
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            this.draw();
        });
    }
    
    loadWorldMap() {
        this.worldImage = new Image();
        this.worldImage.onload = () => {
            this.draw();
        };
        this.worldImage.onerror = () => {
            console.error('Failed to load world map image');
        };
        this.worldImage.src = 'world.jpg';
    }
    
    startSmoothMovement() {
        const animate = () => {
            this.updateSmoothMovement();
            this.draw();
            this.animationId = requestAnimationFrame(animate);
        };
        this.animationId = requestAnimationFrame(animate);
    }
    
    updateSmoothMovement() {
        const lerpSpeed = 0.1; // How fast to interpolate (0.1 = smooth, 1.0 = instant)
        
        Object.keys(this.players).forEach(playerId => {
            const serverPlayer = this.players[playerId];
            
            if (!this.interpolatedPlayers[playerId]) {
                // Initialize interpolated player
                this.interpolatedPlayers[playerId] = {
                    ...serverPlayer,
                    x: serverPlayer.x,
                    y: serverPlayer.y
                };
            }
            
            const interpolatedPlayer = this.interpolatedPlayers[playerId];
            
            // Interpolate position towards server position
            interpolatedPlayer.x += (serverPlayer.x - interpolatedPlayer.x) * lerpSpeed;
            interpolatedPlayer.y += (serverPlayer.y - interpolatedPlayer.y) * lerpSpeed;
            
            // Update other properties immediately (facing, animation, etc.)
            interpolatedPlayer.facing = serverPlayer.facing;
            interpolatedPlayer.isMoving = serverPlayer.isMoving;
            interpolatedPlayer.animationFrame = serverPlayer.animationFrame;
            interpolatedPlayer.username = serverPlayer.username;
            interpolatedPlayer.avatar = serverPlayer.avatar;
        });
        
        // Remove players that no longer exist
        Object.keys(this.interpolatedPlayers).forEach(playerId => {
            if (!this.players[playerId]) {
                delete this.interpolatedPlayers[playerId];
            }
        });
    }
    
    initializeInterpolatedPlayers() {
        // Initialize interpolated players for all existing players
        Object.keys(this.players).forEach(playerId => {
            const serverPlayer = this.players[playerId];
            this.interpolatedPlayers[playerId] = {
                ...serverPlayer,
                x: serverPlayer.x,
                y: serverPlayer.y
            };
        });
    }
    
    setupKeyboardControls() {
        // Key mapping
        this.keyToDirection = {
            'ArrowUp': 'up',
            'ArrowDown': 'down',
            'ArrowLeft': 'left',
            'ArrowRight': 'right'
        };
        
        // Add keyboard event listeners
        document.addEventListener('keydown', (event) => {
            this.handleKeyDown(event);
        });
        
        document.addEventListener('keyup', (event) => {
            this.handleKeyUp(event);
        });
        
        // Prevent arrow keys from scrolling the page
        document.addEventListener('keydown', (event) => {
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
                event.preventDefault();
            }
        });
    }
    
    handleKeyDown(event) {
        if (!this.isConnected || !this.keyToDirection[event.key]) return;
        
        // Add key to pressed keys
        this.pressedKeys[event.key] = true;
        
        // If this is the first key pressed, start moving
        if (!this.isMoving) {
            this.startMovement();
        }
        
        // Send move command immediately
        this.sendMoveCommand();
    }
    
    handleKeyUp(event) {
        if (!this.keyToDirection[event.key]) return;
        
        // Remove key from pressed keys
        delete this.pressedKeys[event.key];
        
        // If no keys are pressed, stop moving
        if (Object.keys(this.pressedKeys).length === 0) {
            this.stopMovement();
        }
    }
    
    startMovement() {
        this.isMoving = true;
        
        // Set up continuous movement
        this.movementInterval = setInterval(() => {
            if (Object.keys(this.pressedKeys).length > 0) {
                this.sendMoveCommand();
            }
        }, 100); // Send move command every 100ms
    }
    
    stopMovement() {
        this.isMoving = false;
        
        // Clear movement interval
        if (this.movementInterval) {
            clearInterval(this.movementInterval);
            this.movementInterval = null;
        }
        
        // Send stop command to server
        this.sendStopCommand();
    }
    
    sendMoveCommand() {
        if (!this.isConnected) return;
        
        // Determine movement direction based on pressed keys
        const directions = Object.keys(this.pressedKeys).map(key => this.keyToDirection[key]);
        
        // For now, prioritize the first direction (simple implementation)
        // Could be enhanced to support diagonal movement
        const direction = directions[0];
        
        if (direction) {
            const moveMessage = {
                action: 'move',
                direction: direction
            };
            
            this.ws.send(JSON.stringify(moveMessage));
        }
    }
    
    sendStopCommand() {
        if (!this.isConnected) return;
        
        const stopMessage = {
            action: 'stop'
        };
        
        this.ws.send(JSON.stringify(stopMessage));
    }
    
    setupChat() {
        this.chatInput = document.getElementById('chatInput');
        this.chatSend = document.getElementById('chatSend');
        this.chatMessagesDiv = document.getElementById('chatMessages');
        
        // Send message on button click
        this.chatSend.addEventListener('click', () => {
            this.sendChatMessage();
        });
        
        // Send message on Enter key
        this.chatInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                this.sendChatMessage();
            }
        });
        
        // Add welcome message
        this.addChatMessage('system', 'Welcome to the game! Type a message to chat with other players.');
        this.addChatMessage('system', 'Temporarily Broken Because Game Server does not accept Chats');
    }
    
    sendChatMessage() {
        const message = this.chatInput.value.trim();
        if (!message || !this.isConnected) return;
        
        const chatMessage = {
            action: 'chat',
            message: message
        };
        
        this.ws.send(JSON.stringify(chatMessage));
        this.chatInput.value = '';
    }
    
    addChatMessage(username, message, isSystem = false) {
        const messageObj = {
            username: username,
            message: message,
            timestamp: new Date(),
            isSystem: isSystem
        };
        
        this.chatMessages.push(messageObj);
        
        // Keep only the last maxChatMessages
        if (this.chatMessages.length > this.maxChatMessages) {
            this.chatMessages.shift();
        }
        
        this.updateChatDisplay();
    }
    
    updateChatDisplay() {
        this.chatMessagesDiv.innerHTML = '';
        
        this.chatMessages.forEach(msg => {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'chat-message';
            
            if (msg.isSystem) {
                messageDiv.innerHTML = `<span class="chat-system">${msg.message}</span>`;
            } else {
                messageDiv.innerHTML = `<span class="chat-username">${msg.username}:</span> ${msg.message}`;
            }
            
            this.chatMessagesDiv.appendChild(messageDiv);
        });
        
        // Scroll to bottom
        this.chatMessagesDiv.scrollTop = this.chatMessagesDiv.scrollHeight;
    }
    
    setupMiniMap() {
        this.miniMapCanvas = document.getElementById('miniMapCanvas');
        this.miniMapCtx = this.miniMapCanvas.getContext('2d');
        
        // Set canvas size
        this.miniMapCanvas.width = this.miniMapSize;
        this.miniMapCanvas.height = this.miniMapSize;
        
        // Add click handler for mini-map navigation
        this.miniMapCanvas.addEventListener('click', (event) => {
            this.handleMiniMapClick(event);
        });
    }
    
    handleMiniMapClick(event) {
        const rect = this.miniMapCanvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        // Convert mini-map coordinates to world coordinates
        const worldX = (x / this.miniMapSize) * this.worldWidth;
        const worldY = (y / this.miniMapSize) * this.worldHeight;
        
        // Center viewport on clicked position
        this.viewportX = worldX - (this.canvas.width / 2);
        this.viewportY = worldY - (this.canvas.height / 2);
        
        // Clamp to world bounds
        this.viewportX = Math.max(0, Math.min(this.viewportX, this.worldWidth - this.canvas.width));
        this.viewportY = Math.max(0, Math.min(this.viewportY, this.worldHeight - this.canvas.height));
        
        this.draw();
    }
    
    drawMiniMap() {
        if (!this.miniMapCtx || !this.worldImage) return;
        
        // Clear mini-map
        this.miniMapCtx.clearRect(0, 0, this.miniMapSize, this.miniMapSize);
        
        // Draw world map background
        this.miniMapCtx.drawImage(
            this.worldImage,
            0, 0, this.worldWidth, this.worldHeight,
            0, 0, this.miniMapSize, this.miniMapSize
        );
        
        // Draw viewport rectangle
        const viewportX = (this.viewportX / this.worldWidth) * this.miniMapSize;
        const viewportY = (this.viewportY / this.worldHeight) * this.miniMapSize;
        const viewportWidth = (this.canvas.width / this.worldWidth) * this.miniMapSize;
        const viewportHeight = (this.canvas.height / this.worldHeight) * this.miniMapSize;
        
        this.miniMapCtx.strokeStyle = '#00ff00';
        this.miniMapCtx.lineWidth = 2;
        this.miniMapCtx.strokeRect(viewportX, viewportY, viewportWidth, viewportHeight);
        
        // Draw player positions
        Object.values(this.players).forEach(player => {
            const playerX = (player.x / this.worldWidth) * this.miniMapSize;
            const playerY = (player.y / this.worldHeight) * this.miniMapSize;
            
            // Different colors for different players
            if (player.id === this.myPlayerId) {
                // Your player - green
                this.miniMapCtx.fillStyle = '#00ff00';
                this.miniMapCtx.beginPath();
                this.miniMapCtx.arc(playerX, playerY, 3, 0, 2 * Math.PI);
                this.miniMapCtx.fill();
            } else {
                // Other players - red
                this.miniMapCtx.fillStyle = '#ff0000';
                this.miniMapCtx.beginPath();
                this.miniMapCtx.arc(playerX, playerY, 2, 0, 2 * Math.PI);
                this.miniMapCtx.fill();
            }
        });
    }
    
    connectToServer() {
        try {
            this.ws = new WebSocket('wss://codepath-mmorg.onrender.com');
            
            this.ws.onopen = () => {
                console.log('Connected to game server');
                this.isConnected = true;
                this.joinGame();
            };
            
            this.ws.onmessage = (event) => {
                this.handleServerMessage(event.data);
            };
            
            this.ws.onclose = () => {
                console.log('Disconnected from game server');
                this.isConnected = false;
                
                // Stop movement when disconnected
                this.stopMovement();
                
                // Attempt to reconnect after 3 seconds
                setTimeout(() => {
                    if (!this.isConnected) {
                        this.connectToServer();
                    }
                }, 3000);
            };
            
            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
        } catch (error) {
            console.error('Failed to connect to server:', error);
        }
    }
    
    joinGame() {
        if (!this.isConnected) return;
        
        const joinMessage = {
            action: 'join_game',
            username: 'Ron'
        };
        
        this.ws.send(JSON.stringify(joinMessage));
    }
    
    handleServerMessage(data) {
        try {
            const message = JSON.parse(data);
            
            switch (message.action) {
                case 'join_game':
                    this.handleJoinGameResponse(message);
                    break;
                case 'player_joined':
                    this.handlePlayerJoined(message);
                    break;
                case 'players_moved':
                    this.handlePlayersMoved(message);
                    break;
                case 'player_left':
                    this.handlePlayerLeft(message);
                    break;
                case 'chat':
                    this.handleChatMessage(message);
                    break;
                default:
                    if (message.success === false) {
                        console.error('Server error:', message.error);
                    }
            }
        } catch (error) {
            console.error('Failed to parse server message:', error);
        }
    }
    
    handleJoinGameResponse(message) {
        if (message.success) {
            this.myPlayerId = message.playerId;
            this.players = message.players;
            this.avatars = message.avatars;
            
            // Initialize interpolated players
            this.initializeInterpolatedPlayers();
            
            // Load avatar images
            this.loadAvatarImages();
            
            // Center viewport on our avatar
            this.centerViewportOnPlayer();
            
            console.log('Successfully joined game as', message.playerId);
            this.draw();
        } else {
            console.error('Failed to join game:', message.error);
        }
    }
    
    handlePlayerJoined(message) {
        this.players[message.player.id] = message.player;
        this.avatars[message.avatar.name] = message.avatar;
        
        // Initialize interpolated player for new player
        this.interpolatedPlayers[message.player.id] = {
            ...message.player,
            x: message.player.x,
            y: message.player.y
        };
        
        this.loadAvatarImages();
    }
    
    handlePlayersMoved(message) {
        Object.assign(this.players, message.players);
        
        // Update viewport if our player moved
        if (this.myPlayerId && message.players[this.myPlayerId]) {
            this.centerViewportOnPlayer();
        }
        
        this.draw();
    }
    
    handlePlayerLeft(message) {
        delete this.players[message.playerId];
        this.draw();
    }
    
    handleChatMessage(message) {
        // Handle incoming chat messages
        if (message.username && message.message) {
            this.addChatMessage(message.username, message.message);
        }
    }
    
    loadAvatarImages() {
        // Pre-load avatar images for efficient rendering
        Object.values(this.avatars).forEach(avatar => {
            Object.values(avatar.frames).forEach(frameArray => {
                frameArray.forEach(frameData => {
                    if (frameData && !frameData.startsWith('data:')) {
                        // If it's not already a data URL, we might need to handle it differently
                        console.log('Avatar frame data:', frameData);
                    }
                });
            });
        });
    }
    
    centerViewportOnPlayer() {
        if (!this.myPlayerId || !this.players[this.myPlayerId]) return;
        
        const myPlayer = this.players[this.myPlayerId];
        
        // Center the viewport on our player
        this.viewportX = myPlayer.x - (this.canvas.width / 2);
        this.viewportY = myPlayer.y - (this.canvas.height / 2);
        
        // Clamp to world bounds
        this.viewportX = Math.max(0, Math.min(this.viewportX, this.worldWidth - this.canvas.width));
        this.viewportY = Math.max(0, Math.min(this.viewportY, this.worldHeight - this.canvas.height));
    }
    
    worldToScreen(worldX, worldY) {
        return {
            x: worldX - this.viewportX,
            y: worldY - this.viewportY
        };
    }
    
    isInViewport(worldX, worldY, margin = 50) {
        const screenPos = this.worldToScreen(worldX, worldY);
        return screenPos.x >= -margin && 
               screenPos.x <= this.canvas.width + margin &&
               screenPos.y >= -margin && 
               screenPos.y <= this.canvas.height + margin;
    }
    
    drawAvatar(player) {
        if (!this.avatars[player.avatar]) return;
        
        const avatar = this.avatars[player.avatar];
        const screenPos = this.worldToScreen(player.x, player.y);
        
        // Skip if not in viewport
        if (!this.isInViewport(player.x, player.y)) return;
        
        // Get the appropriate frame based on direction and animation
        const direction = player.facing;
        const frameIndex = player.animationFrame || 0;
        
        if (!avatar.frames[direction] || !avatar.frames[direction][frameIndex]) {
            // Fallback to south direction if current direction not available
            const fallbackDirection = avatar.frames.south ? 'south' : Object.keys(avatar.frames)[0];
            if (!avatar.frames[fallbackDirection] || !avatar.frames[fallbackDirection][frameIndex]) {
                return;
            }
        }
        
        const frameData = avatar.frames[direction] ? 
            avatar.frames[direction][frameIndex] : 
            avatar.frames.south[frameIndex];
        
        if (!frameData) return;
        
        // Create image from base64 data
        const img = new Image();
        img.onload = () => {
            // Calculate avatar size (maintain aspect ratio)
            const avatarSize = 32; // Base size
            const aspectRatio = img.width / img.height;
            const width = avatarSize;
            const height = avatarSize / aspectRatio;
            
            // Center the avatar on the player position
            const drawX = screenPos.x - (width / 2);
            const drawY = screenPos.y - height;
            
            // Handle west direction by flipping horizontally
            if (direction === 'west') {
                this.ctx.save();
                this.ctx.scale(-1, 1);
                this.ctx.drawImage(img, -drawX - width, drawY, width, height);
                this.ctx.restore();
            } else {
                this.ctx.drawImage(img, drawX, drawY, width, height);
            }
            
            // Draw username label
            this.drawUsernameLabel(player.username, screenPos.x, screenPos.y - height - 5);
        };
        img.onerror = () => {
            console.error('Failed to load avatar image for', player.username);
        };
        img.src = frameData;
    }
    
    drawUsernameLabel(username, x, y) {
        this.ctx.save();
        
        // Set text style
        this.ctx.font = '12px Arial';
        this.ctx.fillStyle = 'white';
        this.ctx.strokeStyle = 'black';
        this.ctx.lineWidth = 2;
        this.ctx.textAlign = 'center';
        
        // Draw text with outline
        this.ctx.strokeText(username, x, y);
        this.ctx.fillText(username, x, y);
        
        this.ctx.restore();
    }
    
    draw() {
        if (!this.worldImage) return;
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw the world map with viewport offset
        this.ctx.drawImage(
            this.worldImage,
            this.viewportX, this.viewportY, this.canvas.width, this.canvas.height,  // source rectangle
            0, 0, this.canvas.width, this.canvas.height   // destination rectangle
        );
        
        // Draw all players using server positions (temporarily disable smooth movement)
        Object.values(this.players).forEach(player => {
            this.drawAvatar(player);
        });
        
        // Draw mini-map
        this.drawMiniMap();
    }
}

// Initialize the game client when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new GameClient();
});
