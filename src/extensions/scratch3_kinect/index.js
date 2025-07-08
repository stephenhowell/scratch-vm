const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const formatMessage = require('format-message');

/**
 * PoseLandmarkBlocks Extension for Scratch 3.0
 * Detects human pose landmarks from Kinect (legacy) and Android (primary) sources
 * Based on MediaPipe PoseLandmarker methodology
 * @param {Runtime} runtime - the runtime instantiating this block package.
 */
class Scratch3PoseLandmarkBlocks {
    constructor(runtime) {
        this.runtime = runtime;
        
        // === SHARED DATA STRUCTURES ===
        this._initializeSharedData();
        
        // === KINECT SETUP ===
        this._initializeKinect();
        
        // === ANDROID SETUP ===
        this._initializeAndroid();
        
        console.log('PoseLandmarkBlocks extension initialized');
    }

    // ====================================================================
    // === SHARED CORE FUNCTIONALITY ===
    // ====================================================================

    /**
     * Initialize shared data structures for efficient access
     * @private
     */
    _initializeSharedData() {
        // Pre-allocate body data structure for performance
        const emptyBody = {
            rightHandState: 'Unknown',
            leftHandState: 'Unknown',
            // Pre-define all joint positions as null
            Head: null, Neck: null, SpineShoulder: null, SpineMid: null, SpineBase: null,
            ShoulderLeft: null, ElbowLeft: null, WristLeft: null, HandLeft: null, HandTipLeft: null, ThumbLeft: null,
            ShoulderRight: null, ElbowRight: null, WristRight: null, HandRight: null, HandTipRight: null, ThumbRight: null,
            HipLeft: null, KneeLeft: null, AnkleLeft: null, FootLeft: null,
            HipRight: null, KneeRight: null, AnkleRight: null, FootRight: null
        };
        
        // Pre-allocate array for 7 bodies (performance: avoid dynamic allocation)
        this.bodies = new Array(7);
        for (let i = 0; i < 7; i++) {
            this.bodies[i] = {...emptyBody};
        }
        
        this.numTracked = 0;
        
        // Cache for frequently accessed values (performance optimization)
        this._coordIndexCache = { X: 0, Y: 1, Z: 2 };
        this._personIndexCache = {
            'Closest Person': 0, 'Person 1': 1, 'Person 2': 2, 
            'Person 3': 3, 'Person 4': 4, 'Person 5': 5, 'Person 6': 6
        };
    }

    /**
     * Unified data handler for both Kinect and Android sources
     * Optimized for performance - minimal parsing overhead
     * @param {string} dataString - JSON data from either source
     * @private
     */
    _handleIncomingData(dataString) {
        try {
            const data = JSON.parse(dataString);
            // Debugging output for incoming data
            // console.log('PoseLandmarkBlocks: Received data:', data);
            
            // Fast path for body data (most common)
            if (data.type === 'body') {
                const bodyIndex = data.bodyIndex;
                if (bodyIndex >= 0 && bodyIndex < 7) {
                    // Direct assignment - no unnecessary copying
                    Object.assign(this.bodies[bodyIndex], data.joints);
                    this.bodies[bodyIndex].rightHandState = data.rightHandState || 'Unknown';
                    this.bodies[bodyIndex].leftHandState = data.leftHandState || 'Unknown';
                }
                return;
            }
            
            // Handle scene updates
            if (data.type === 'scene') {
                this.numTracked = data.numTracked || 0;
                return;
            }
            
            // Handle events (entry/exit)
            if (data.type === 'event') {
                // Future: trigger Scratch events here
                console.log(`Motion event: ${data.eventType}`);
            }
        } catch (error) {
            console.error('PoseLandmarkBlocks: Error parsing data:', error);
        }
    }

    // ====================================================================
    // === KINECT FUNCTIONALITY ===
    // ====================================================================

    /**
     * Initialize Kinect WebSocket client
     * @private
     */
    _initializeKinect() {
        this.kinectConnection = null;
        this.kinectConnectionStatus = 0; // 0=disconnected, 1=connecting, 2=connected
    }

    /**
     * Connect to Kinect2Scratch.exe WebSocket server
     */
    connectKinect() {
        if (this.kinectConnectionStatus !== 0) {
            console.log('Kinect: Connection already in progress or established');
            return;
        }

        if (typeof window.WebSocket === 'undefined') {
            console.warn('Kinect: WebSocket not available');
            return;
        }

        try {
            this.kinectConnection = new window.WebSocket('ws://localhost:8181/');
            this.kinectConnectionStatus = 1;
            console.log('Kinect: Connecting to localhost:8181...');

            this.kinectConnection.onopen = () => {
                console.log('Kinect: Connected successfully');
                this.kinectConnectionStatus = 2;
            };

            this.kinectConnection.onclose = () => {
                console.log('Kinect: Connection closed');
                this.kinectConnectionStatus = 0;
                this.kinectConnection = null;
            };

            this.kinectConnection.onerror = (error) => {
                console.log(`Kinect: Connection error - ${error}`);
                this.kinectConnectionStatus = 0;
                this.kinectConnection = null;
            };

            this.kinectConnection.onmessage = (e) => {
                this._handleIncomingData(e.data);
            };
        } catch (error) {
            console.error('Kinect: Failed to create connection:', error);
            this.kinectConnectionStatus = 0;
        }
    }

    /**
     * Connect to Kinect and wait until connected and receiving data
     * @returns {Promise} Promise that resolves when Kinect is connected and responding
     */
    connectKinectAndWait() {
        console.log('Kinect: Starting connection and waiting...');
        
        // Start the connection
        this.connectKinect();
        
        return new Promise((resolve) => {
            let dataReceived = false;
            let statusCount = 0;
            
            // Listen for first data message to confirm server is responding
            const originalHandler = this._handleIncomingData.bind(this);
            this._handleIncomingData = (dataString) => {
                originalHandler(dataString);
                if (!dataReceived) {
                    dataReceived = true;
                    console.log('✅ Kinect: Connection confirmed - receiving data!');
                    this._handleIncomingData = originalHandler; // Restore handler
                    resolve();
                }
            };
            
            const checkConnection = () => {
                statusCount++;
                
                if (this.kinectConnectionStatus === 2 && dataReceived) {
                    // Connected and receiving data - already resolved above
                    return;
                } else if (this.kinectConnectionStatus === 0) {
                    // Not connected yet - show helpful message
                    if (statusCount % 10 === 1) { // Every 5 seconds
                        console.log('⏳ Kinect: Waiting for Kinect2Scratch.exe to start...');
                        console.log('💡 Tip: Make sure Kinect2Scratch.exe is running on port 8181');
                    }
                    // Try connecting again
                    this.connectKinect();
                } else if (this.kinectConnectionStatus === 2 && !dataReceived) {
                    // Connected but no data yet
                    if (statusCount % 6 === 1) { // Every 3 seconds  
                        console.log('⏳ Kinect: Connected to server, waiting for pose data...');
                        console.log('💡 Tip: Stand in front of the Kinect sensor');
                    }
                }
                
                // Keep checking every 500ms
                setTimeout(checkConnection, 500);
            };
            
            // Start checking
            checkConnection();
        });
    }

    /**
     * Check if Kinect is connected
     * @returns {boolean}
     */
    isKinectConnected() {
        return this.kinectConnectionStatus === 2 && 
               this.kinectConnection && 
               this.kinectConnection.readyState === 1;
    }

    /**
     * Disconnect from Kinect
     */
    disconnectKinect() {
        if (this.kinectConnection && this.kinectConnection.readyState === 1) {
            this.kinectConnection.close();
            this.kinectConnectionStatus = 0;
            console.log('Kinect: Disconnected by user');
        }
    }

    // ====================================================================
    // === ANDROID FUNCTIONALITY ===
    // ====================================================================

    /**
     * Initialize Android WebSocket server via IPC
     * @private
     */
    _initializeAndroid() {
        this.androidConnectionStatus = false;
        this.androidClientCount = 0;
        this.isWaitingForPhone = false; // Track if we're actively waiting
        
        // Setup IPC listeners for Android communication
        this._setupAndroidIPC();
    }

    /**
     * Setup IPC communication with main process for Android server
     * @private
     */
    _setupAndroidIPC() {
        if (!this._hasAndroidAPI()) {
            console.warn('Android: API not available (not in Electron)');
            return;
        }
        
        // Listen for Android device data
        window.electronAPI.onPoseData((event, dataString) => {            
            this._handleIncomingData(dataString);
        });
        
        window.electronAPI.onPoseConnectionStatus(status => {
            console.log('Android: Connection status update received:', status);
            this.androidConnectionStatus = status.connected;        
            this.androidClientCount = status.count; 
        });
    }

    /**
     * Check if Android API is available
     * @private
     */
    _hasAndroidAPI() {
        return typeof window !== 'undefined' && 
           window.electronAPI && 
           window.electronAPI.isElectron;
    }

    /**
     * Start Android WebSocket server
     */
    async startAndroidServer() {
        if (!this._hasAndroidAPI()) {
            console.log('Android: Server not available (not in Electron)');
            return;
        }
        
        console.log('Android: Starting server...');
        
        try {
            const result = await window.electronAPI.startPoseServer();
            console.log(`Android: ${result.message}`);
        } catch (error) {
            console.error('Android: Server start error:', error);
        }
    }

    /**
     * Starts the Android WebSocket server and waits for a client to connect.
     * This is a blocking block that returns a Promise.
     * @returns {Promise} A Promise that resolves when a client connects.
     */
    startAndroidServerAndWait() {
        // First, check if the API is available.
        if (!this._hasAndroidAPI()) {
            console.warn('Android: Electron API not available.');
            return Promise.resolve();
        }
        console.log('🚀 Android: Starting server and waiting for a phone to connect...');
        console.log('💡 Tip: Start the Android app and connect to this computer.');

        // 1. Tell the main process to start the server.
        // This is "fire-and-forget"; we don't need to wait for the result here.
        this.runtime.electronAPI.startPoseServer();

        // 2. Return a new Promise. Scratch will pause the script here.
        return new Promise(resolve => {
            // 3. Use the dedicated one-time listener we created in preload.js.
            this.runtime.electronAPI.onPoseClientConnected(() => {
                console.log('✅ Android: Phone connected! Resuming Scratch script.');
                
                // 4. When the main process tells us a client has connected,
                // we resolve the promise. This tells the Scratch VM to continue.
                resolve();
            });
        });
    }

    /**
     * Check if Android devices are connected
     * @returns {boolean}
     */
    isAndroidConnected() {
        return this.androidConnectionStatus;
         //&& this.androidClientCount > 0;
    }

    // ====================================================================
    // === SCRATCH BLOCK INTERFACE ===
    // ====================================================================

    /**
     * @returns {object} metadata for this extension and its blocks.
     */
    getInfo() {
        return {
            id: 'poselandmarkblocks',
            name: formatMessage({
                id: 'poselandmark.categoryName',
                default: 'Pose Landmark Blocks',
                description: 'Human pose landmark detection for Kinect and Android'                
            }),
            menuIconURI: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
            blockIconURI: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==',            
            blocks: [
                // === CONNECTION BLOCKS ===
                {
                    opcode: 'isConnected',
                    blockType: BlockType.BOOLEAN,
                    text: '[DEVICE] is connected?',
                    arguments: {
                        DEVICE: { type: ArgumentType.STRING, menu: 'devices', defaultValue: 'phone' }
                    }
                },
                {
                    opcode: 'startConnection',
                    blockType: BlockType.COMMAND,
                    text: 'start [DEVICE] connection',
                    arguments: {
                        DEVICE: { type: ArgumentType.STRING, menu: 'devices', defaultValue: 'phone' }
                    }
                },
                {
                    opcode: 'startConnectionAndWait',
                    blockType: BlockType.COMMAND,
                    text: 'start [DEVICE] connection and wait',
                    arguments: {
                        DEVICE: { type: ArgumentType.STRING, menu: 'devices', defaultValue: 'phone' }
                    }
                },
                {
                    opcode: 'stopConnection',
                    blockType: BlockType.COMMAND,   
                    text: 'stop connection'
                },
                // {
                //     opcode: 'getConnectionStatus',
                //     blockType: BlockType.REPORTER,
                //     text: 'what is connected'
                // },
                
                // === BODY POSITION BLOCKS ===
                {
                    opcode: 'getLimbCoordinate',
                    blockType: BlockType.REPORTER,
                    text: '[COORDINATE] of [SIDE] [LIMB] of [INDEX]',
                    arguments: {
                        COORDINATE: { type: ArgumentType.STRING, menu: 'coordinate', defaultValue: 'X' },
                        SIDE: { type: ArgumentType.STRING, menu: 'side', defaultValue: 'Right' },
                        LIMB: { type: ArgumentType.STRING, menu: 'limbs', defaultValue: 'Hand' },
                        INDEX: { type: ArgumentType.STRING, menu: 'index', defaultValue: 'Closest Person' }
                    }
                },
                {
                    opcode: 'getTorsoCoordinate',
                    blockType: BlockType.REPORTER,
                    text: '[COORDINATE] of [TORSO] of [INDEX]',
                    arguments: {
                        COORDINATE: { type: ArgumentType.STRING, menu: 'coordinate', defaultValue: 'X' },
                        TORSO: { type: ArgumentType.STRING, menu: 'torso', defaultValue: 'Head' },
                        INDEX: { type: ArgumentType.STRING, menu: 'index', defaultValue: 'Closest Person' }
                    }
                },
                {
                    opcode: 'isHandState',
                    blockType: BlockType.BOOLEAN,
                    text: '[SIDE] Hand is [STATE] of [INDEX]',
                    arguments: {
                        SIDE: { type: ArgumentType.STRING, menu: 'side', defaultValue: 'Right' },
                        STATE: { type: ArgumentType.STRING, menu: 'state', defaultValue: 'Closed' },
                        INDEX: { type: ArgumentType.STRING, menu: 'index', defaultValue: 'Closest Person' }
                    }
                },
                {
                    opcode: 'getTrackedUsers',
                    blockType: BlockType.REPORTER,
                    text: 'number of tracked people'
                },
                
                // === CONNECTION STATUS BLOCKS === Deprecated
                // {
                //     opcode: 'isKinectConnected',
                //     blockType: BlockType.BOOLEAN,
                //     text: 'Kinect camera is connected?'
                // },
                // {
                //     opcode: 'isAndroidConnected',
                //     blockType: BlockType.BOOLEAN,
                //     text: 'phone is connected?'
                // }
            ],
            menus: { 
                devices: {
                    acceptReporters: true,
                    items: [
                        { text: 'phone', value: 'phone' },
                        { text: 'Kinect camera', value: 'kinect' }
                    ]
                },
                index: {
                    acceptReporters: true,
                    items: [
                        { text: 'Closest Person', value: 'Closest Person' },
                        { text: 'Person 1', value: 'Person 1' },
                        { text: 'Person 2', value: 'Person 2' },
                        { text: 'Person 3', value: 'Person 3' },
                        { text: 'Person 4', value: 'Person 4' },
                        { text: 'Person 5', value: 'Person 5' },
                        { text: 'Person 6', value: 'Person 6' }
                    ]
                },
                coordinate: {
                    acceptReporters: true,
                    items: [
                        { text: 'X', value: 'X' },
                        { text: 'Y', value: 'Y' },
                        { text: 'Z', value: 'Z' }
                    ]
                },
                side: {
                    acceptReporters: true,
                    items: [
                        { text: 'Right', value: 'Right' },
                        { text: 'Left', value: 'Left' }
                    ]
                },
                state: {
                    acceptReporters: true,
                    items: [
                        { text: 'Open', value: 'Open' },
                        { text: 'Closed', value: 'Closed' },
                        { text: 'Lasso', value: 'Lasso' },
                        { text: 'Unknown', value: 'Unknown' }
                    ]
                },
                torso: {
                    acceptReporters: true,
                    items: [
                        { text: 'Head', value: 'Head' },
                        { text: 'Neck', value: 'Neck' },
                        { text: 'SpineShoulder', value: 'SpineShoulder' },
                        { text: 'SpineMid', value: 'SpineMid' },
                        { text: 'SpineBase', value: 'SpineBase' }
                    ]
                },
                limbs: {
                    acceptReporters: true,
                    items: [
                        { text: 'Shoulder', value: 'Shoulder' },
                        { text: 'Elbow', value: 'Elbow' },
                        { text: 'Wrist', value: 'Wrist' },
                        { text: 'Hand', value: 'Hand' },
                        { text: 'HandTip', value: 'HandTip' },
                        { text: 'Thumb', value: 'Thumb' },
                        { text: 'Hip', value: 'Hip' },
                        { text: 'Knee', value: 'Knee' },
                        { text: 'Ankle', value: 'Ankle' },
                        { text: 'Foot', value: 'Foot' }
                    ]
                }
            }
        };
    }

    // ====================================================================
    // === BLOCK IMPLEMENTATION METHODS ===
    // ====================================================================

    /**
     * Start connection to selected device (non-blocking)
     * @param {object} args - block arguments
     */
    startConnection(args) {
        if (args.DEVICE === 'phone') {
            this.startAndroidServer();
        } else if (args.DEVICE === 'kinect') {
            this.connectKinect();
        }
    }

    /**
     * Start connection to selected device and wait until connected (blocking)
     * @param {object} args - block arguments
     * @returns {Promise} Promise that resolves when connected and ready
     */
    async startConnectionAndWait(args) {
        
        // console.log('getValue - window exists:', typeof window);
        // console.log('getValue - electronAPI exists:', typeof window.electronAPI);
        // console.log('getValue - runtime electronAPI:', typeof this.runtime.electronAPI);

        console.log(`🚀 Starting ${args.DEVICE} connection and waiting...`);
        console.log('💡 Press the red stop button to cancel if needed');
        
        try {
            if (args.DEVICE === 'phone') {
                await this.startAndroidServerAndWait();
                console.log('🎉 Phone connection ready! Script will continue.');
            } else if (args.DEVICE === 'kinect') {
                await this.connectKinectAndWait();
                console.log('🎉 Kinect connection ready! Script will continue.');
            } else {
                console.error(`❌ Unknown device: ${args.DEVICE}`);
                return; // Don't throw error for unknown device, just continue
            }
        } catch (error) {
            // Only server startup errors should reach here (not connection timeouts)
            console.error(`❌ Failed to start ${args.DEVICE} server:`, error.message);
            console.log('💡 Check the console for details, then try again');
            // Don't re-throw - let user try again rather than breaking script
        }
    }

    
    stopConnection() {
        // Disconnect from Kinect if it's connected
        this.disconnectKinect();

        // Tell the main process to close the phone client socket
        if (this._hasAndroidAPI()) {
            window.electronAPI.stopPoseClient();
        }
        // Immediately update the extension's internal state
        this.androidConnectionStatus = false; 
    }

    /**
     * Get coordinate value for limb (with side) - matches original Scratch 2 structure
     * @param {object} args - block arguments
     * @returns {number} coordinate value
     */
    getLimbCoordinate(args) {
        // Use cached indices for performance
        const personIndex = this._personIndexCache[args.INDEX] || 0;
        const coordIndex = this._coordIndexCache[args.COORDINATE] || 0;
        
        // Combine side and limb like original: "Right" + "Hand" = "HandRight"
        const jointName = args.LIMB + args.SIDE;
        
        const body = this.bodies[personIndex];
        if (body && body[jointName]) {
            const joint = body[jointName];
            return joint[coordIndex] || 0;
        }
        return 0;
    }

    /**
     * Get coordinate value for torso parts (no side) - matches original structure
     * @param {object} args - block arguments
     * @returns {number} coordinate value
     */
    getTorsoCoordinate(args) {
        const personIndex = this._personIndexCache[args.INDEX] || 0;
        const coordIndex = this._coordIndexCache[args.COORDINATE] || 0;
        
        const body = this.bodies[personIndex];
        if (body && body[args.TORSO]) {
            const joint = body[args.TORSO];
            return joint[coordIndex] || 0;
        }
        return 0;
    }

    /**
     * Check if hand is in specific state - matches original structure
     * @param {object} args - block arguments
     * @returns {boolean}
     */
    isHandState(args) {
        const personIndex = this._personIndexCache[args.INDEX] || 0;
        const body = this.bodies[personIndex];
        
        if (body) {
            const currentState = args.SIDE === 'Right' ? body.rightHandState : body.leftHandState;
            return currentState === args.STATE;
        }
        return false;
    }

    /**
     * Get number of tracked people - matches original method name
     * @returns {number}
     */
    getTrackedUsers() {
        return this.numTracked;
    }

    /**
     * Get connection status description  
     * @returns {string}
     */
    // getConnectionStatus() {
    //     const kinect = this.isKinectConnected();
    //     const android = this.isAndroidConnected();
        
    //     // Check for connecting/waiting states
    //     if (this.kinectConnectionStatus === 1) {
    //         return 'connecting to Kinect...';
    //     }
    //     if (this.kinectConnectionStatus === 2 && !kinect) {
    //         return 'waiting for Kinect data...';
    //     }
    //     if (this.isWaitingForPhone) {
    //         return 'waiting for phone...';
    //     }
        
    //     // Show actual connections
    //     if (kinect && android) return 'Kinect camera and phone';
    //     if (kinect) return 'Kinect camera';
    //     if (android) return `phone (${this.androidClientCount})`;
        
    //     return 'nothing';
    // }

    isConnected(args) {
        if (args.DEVICE === 'phone') {
            return this.isAndroidConnected();
        } else if (args.DEVICE === 'kinect') {
            return this.isKinectConnected();
        }
        return false; // Default to false if the device is unknown
    }
}

module.exports = Scratch3PoseLandmarkBlocks;