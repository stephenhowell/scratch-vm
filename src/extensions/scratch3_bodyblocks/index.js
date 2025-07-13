const ArgumentType = require('../../extension-support/argument-type.js');
const BlockType = require('../../extension-support/block-type.js');
const formatMessage = require('format-message');
const Color = require('../../util/color');
const Cast = require('../../util/cast');
const MathUtil = require('../../util/math-util');
const _menuIconURI = require('./icon.js');
const _blockIconURI = require('./block.js');

/**
 * Body Blocks Extension for Scratch 3.0
 * Detects human pose landmarks from Kinect (legacy) and Android (primary) sources
 * Based on MediaPipe PoseLandmarker model (see acknowledgements file in /licenses/ for details)
 * @param {Runtime} runtime - the runtime instantiating this block package.
 */
class Scratch3BodyBlocks {


    constructor(runtime) {
        this.runtime = runtime;

        // Kinect and now Android data will be stored here
        this._initializeSharedData();

        // Legacy Kinect functionality
        this._initializeKinect();

        // New Android functionality
        this._initializeAndroid();

        // Create the new canvas for drawing skeleton (so user "knows" when it's active, doesn't interfere with the stage/sprites)
        this.createSkeletonCanvas();
    }
    
    createSkeletonCanvas() {
        // console.log('Initializing CSS-based skeleton canvas...');

        const stageWrapper = this.runtime.renderer.canvas.parentElement;

        this.skeletonCanvas = document.createElement('canvas');
        this.skeletonCtx = this.skeletonCanvas.getContext('2d');

        // 1. Set the canvas's INTERNAL resolution ONCE. This is the surface we draw on.
        //    It should match Scratch's native stage size.
        this.skeletonCanvas.width = 480;
        this.skeletonCanvas.height = 360;

        // 2. Use CSS to make the canvas a perfect, auto-stretching overlay.
        this.skeletonCanvas.style.position = 'absolute';
        this.skeletonCanvas.style.top = '0';
        this.skeletonCanvas.style.left = '0';
        this.skeletonCanvas.style.width = '100%'; // Stretch to fill the container's width
        this.skeletonCanvas.style.height = '100%'; // Stretch to fill the container's height
        this.skeletonCanvas.style.pointerEvents = 'none'; // Make it click-through


        // 3. Add it to the stage's container.
        stageWrapper.appendChild(this.skeletonCanvas);

        // Other member variables we need for the skeleton canvas
        this.skeletonColor = 33.3;       // Hue (0-100), default is green
        this.skeletonSaturation = 100;   // Saturation (0-100)
        this.skeletonBrightness = 100;   // Brightness (0-100)        

        this.skeletonLineWidth = 4;
        this.isHeadVisible = true;
        this.isSkeletonVisible = true;    // Master on/off switch

    }

/**
 * Called when the Scratch stage changes size.
 * @param {object} detail - An object with the new width and height.
 * @param {number} detail.width - The new width of the stage.
 * @param {number} detail.height - The new height of the stage.
 */
// onStageSizeChanged({width, height}) {
//     console.log('Stage size changed:', width, height);

//    const stage = this.runtime.renderer.canvas;
    
//     // Update canvas internal resolution
//     this.skeletonCanvas.width = stage.width;
//     this.skeletonCanvas.height = stage.height;
    
//     // Copy ALL CSS properties from the stage canvas
//     const stageStyles = window.getComputedStyle(stage);
//     this.skeletonCanvas.style.width = stageStyles.width;
//     this.skeletonCanvas.style.height = stageStyles.height;
//     this.skeletonCanvas.style.transform = stageStyles.transform;
//     this.skeletonCanvas.style.transformOrigin = stageStyles.transformOrigin;
    
//     // Ensure it stays as overlay
//     this.skeletonCanvas.style.position = 'absolute';
//     this.skeletonCanvas.style.left = '0';
//     this.skeletonCanvas.style.top = '0';
//     this.skeletonCanvas.style.pointerEvents = 'none';
    
//     console.log('Skeleton canvas resized:', {
//         width: this.skeletonCanvas.width,
//         height: this.skeletonCanvas.height,
//         cssWidth: this.skeletonCanvas.style.width,
//         cssHeight: this.skeletonCanvas.style.height,
//         transform: this.skeletonCanvas.style.transform
//     });
// }
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
            Head: null,
            Neck: null,
            SpineShoulder: null,
            SpineMid: null,
            SpineBase: null,

            ShoulderLeft: null,
            ElbowLeft: null,
            WristLeft: null,
            HandLeft: null,
            ThumbLeft: null,
            LittleFingerLeft: null,
            HandTipLeft: null,

            ShoulderRight: null,
            ElbowRight: null,
            WristRight: null,
            HandRight: null,
            ThumbRight: null,
            LittleFingerRight: null,
            HandTipRight: null,

            HipLeft: null,
            HipRight: null,

            KneeLeft: null,
            KneeRight: null,
            AnkleLeft: null,
            AnkleRight: null,
            FootLeft: null,
            FootRight: null


        };
        
        this.bodies = new Array(7);
        for (let i = 0; i < 7; i++) {
            this.bodies[i] = { ...emptyBody };
        }
        this.numTracked = 0;
        this._coordIndexCache = { X: 0, Y: 1 }; // Z coordinate removed.
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
                        
            const unifiedJoints = {};            
            const bodyIndex = data.bodyIndex || 0;

            if (data.landmarks && Array.isArray(data.landmarks)) {
                if (data.landmarks.length === 0) return;

                const landmarks = data.landmarks;
                                
                const transformToScratch = (x, y) => {
                    const scratchX = (x * 480) - 240;
                    const scratchY = 180 - (y * 360);
                    return [scratchX, scratchY];
                };

                // --- Map and Transform all landmarks first ---
                unifiedJoints.Head = transformToScratch(landmarks[0][0], landmarks[0][1]);
                unifiedJoints.ShoulderLeft = transformToScratch(landmarks[11][0], landmarks[11][1]);
                unifiedJoints.ShoulderRight = transformToScratch(landmarks[12][0], landmarks[12][1]);
                unifiedJoints.ElbowLeft = transformToScratch(landmarks[13][0], landmarks[13][1]);
                unifiedJoints.ElbowRight = transformToScratch(landmarks[14][0], landmarks[14][1]);
                unifiedJoints.WristLeft = transformToScratch(landmarks[15][0], landmarks[15][1]);
                unifiedJoints.WristRight = transformToScratch(landmarks[16][0], landmarks[16][1]);
                unifiedJoints.LittleFingerLeft = transformToScratch(landmarks[17][0], landmarks[17][1]);
                unifiedJoints.LittleFingerRight = transformToScratch(landmarks[18][0], landmarks[18][1]);
                unifiedJoints.HandTipLeft = transformToScratch(landmarks[19][0], landmarks[19][1]);
                unifiedJoints.HandTipRight = transformToScratch(landmarks[20][0], landmarks[20][1]);
                unifiedJoints.ThumbLeft = transformToScratch(landmarks[21][0], landmarks[21][1]);
                unifiedJoints.ThumbRight = transformToScratch(landmarks[22][0], landmarks[22][1]);
                unifiedJoints.HipLeft = transformToScratch(landmarks[23][0], landmarks[23][1]);
                unifiedJoints.HipRight = transformToScratch(landmarks[24][0], landmarks[24][1]);

                unifiedJoints.KneeLeft = transformToScratch(landmarks[25][0], landmarks[25][1]);
                unifiedJoints.KneeRight = transformToScratch(landmarks[26][0], landmarks[26][1]);                
                unifiedJoints.AnkleLeft = transformToScratch(landmarks[27][0], landmarks[27][1]);
                unifiedJoints.AnkleRight = transformToScratch(landmarks[28][0], landmarks[28][1]);
                unifiedJoints.FootLeft = transformToScratch(landmarks[31][0], landmarks[31][1]);
                unifiedJoints.FootRight = transformToScratch(landmarks[32][0], landmarks[32][1]);

                // Use the already transformed points to approximate hand positions
                // HandLeft is the midpoint of WristLeft and HandTipLeft and LittleFingerLeft and ThumbLeft                
                unifiedJoints.HandLeft = [ (unifiedJoints.WristLeft[0] + unifiedJoints.HandTipLeft[0] + unifiedJoints.LittleFingerLeft[0] + unifiedJoints.ThumbLeft[0]) / 4,
                                           (unifiedJoints.WristLeft[1] + unifiedJoints.HandTipLeft[1] + unifiedJoints.LittleFingerLeft[1] + unifiedJoints.ThumbLeft[1]) / 4];
                
                unifiedJoints.HandRight = [ (unifiedJoints.WristRight[0] + unifiedJoints.HandTipRight[0] + unifiedJoints.LittleFingerRight[0] + unifiedJoints.ThumbRight[0]) / 4,
                                            (unifiedJoints.WristRight[1] + unifiedJoints.HandTipRight[1] + unifiedJoints.LittleFingerRight[1] + unifiedJoints.ThumbRight[1]) / 4];

                // --- Now, approximate joints using the values we just calculated ---
                const shoulderMidX = (unifiedJoints.ShoulderLeft[0] + unifiedJoints.ShoulderRight[0]) / 2;
                const shoulderMidY = (unifiedJoints.ShoulderLeft[1] + unifiedJoints.ShoulderRight[1]) / 2;
                unifiedJoints.SpineShoulder = [shoulderMidX, shoulderMidY];

                const hipMidX = (unifiedJoints.HipLeft[0] + unifiedJoints.HipRight[0]) / 2;
                const hipMidY = (unifiedJoints.HipLeft[1] + unifiedJoints.HipRight[1]) / 2;
                unifiedJoints.SpineBase = [hipMidX, hipMidY];

                const spineMidX = (shoulderMidX + hipMidX) / 2;
                const spineMidY = (shoulderMidY + hipMidY) / 2;
                unifiedJoints.SpineMid = [spineMidX, spineMidY];

                const neckX = (shoulderMidX * 0.25) + (unifiedJoints.Head[0] * 0.75);
                const neckY = (shoulderMidY * 0.25) + (unifiedJoints.Head[1] * 0.75);
                unifiedJoints.Neck = [neckX, neckY];

                // --- Finally, assign the complete data ---
                // First, create a fresh, empty body object
                const newBody = { ...this.emptyBody };
                // Then, apply the new joint data over top of it
                Object.assign(newBody, unifiedJoints);
                // Finally, replace the old body data entirely with the new one
                this.bodies[bodyIndex] = newBody;
                // Log 2: See the mapped joints right before they are saved. (Debug)
                // console.log('Mapped Unified Joints:', unifiedJoints);

            } else if (data.joints) {
                // --- It's Kinect Data ---
                // This directly maps our old Kinect data to the new unified skeleton
                const joints = data.joints;
                Object.assign(unifiedJoints, joints);
                
            } else if (data.type === 'scene') {
                this.numTracked = data.numTracked || 0;
                return;
            } else {
                return; // Unrecognized data format
            }            

            // Assign the processed data to our internal state
            if (bodyIndex >= 0 && bodyIndex < 7) {
                Object.assign(this.bodies[bodyIndex], unifiedJoints);
            }

        } catch (error) {
            // Fail silently in production but scream in debug mode
            console.error('❌ CRITICAL ERROR in _handleIncomingData:', error);
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
            // console.log('Kinect: Connection already in progress or established');
            return;
        }

        if (typeof window.WebSocket === 'undefined') {
            console.warn('Kinect: WebSocket not available');
            return;
        }

        try {
            this.kinectConnection = new window.WebSocket('ws://localhost:8181/');
            this.kinectConnectionStatus = 1;
            // console.log('Kinect: Connecting to localhost:8181...');

            this.kinectConnection.onopen = () => {
                // console.log('Kinect: Connected successfully');
                this.kinectConnectionStatus = 2;
            };

            this.kinectConnection.onclose = () => {
                // console.log('Kinect: Connection closed');
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
        // console.log('Kinect: Starting connection and waiting...');

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
                    // console.log('✅ Kinect: Connection confirmed - receiving data!');
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
                        // console.log('⏳ Kinect: Waiting for Kinect2Scratch.exe to start...');
                        // console.log('💡 Tip: Make sure Kinect2Scratch.exe is running on port 8181');
                    }
                    // Try connecting again
                    this.connectKinect();
                } else if (this.kinectConnectionStatus === 2 && !dataReceived) {
                    // Connected but no data yet
                    if (statusCount % 6 === 1) { // Every 3 seconds  
                        // console.log('⏳ Kinect: Connected to server, waiting for pose data...');
                        // console.log('💡 Tip: Stand in front of the Kinect sensor');
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
            // console.log('Kinect: Disconnected by user');
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
        window.electronAPI.onPoseData((dataString) => {
            this._handleIncomingData(dataString);
        });

        window.electronAPI.onPoseConnectionStatus(status => {
            // console.log('Android: Connection status update received:', status);
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
            // console.log('Android: Server not available (not in Electron)');
            return;
        }

        // console.log('Android: Starting server...');

        try {
            const result = await window.electronAPI.startPoseServer();
            // console.log(`Android: ${result.message}`);
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
        // console.log('🚀 Android: Starting server and waiting for a phone to connect...');
        // console.log('💡 Tip: Start the Android app and connect to this computer.');

        // 1. Tell the main process to start the server.
        // This is "fire-and-forget"; we don't need to wait for the result here.
        window.electronAPI.startPoseServer();

        // 2. Return a new Promise. Scratch will pause the script here.
        return new Promise(resolve => {
            // 3. Use the dedicated one-time listener in preload.js.
            window.electronAPI.onPoseClientConnected(() => {
                // console.log('✅ Android: Phone connected! Resuming Scratch script.');

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
            id: 'bodyblocks',
            name: formatMessage({
                id: 'bodyblocks.categoryName',
                default: 'Body Blocks', 
                description: 'Human body pose detection for Kinect and Android'
            }),
            menuIconURI: _menuIconURI,
            blockIconURI: _blockIconURI,
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
                // {
                //     opcode: 'startConnectionAndWait',
                //     blockType: BlockType.COMMAND,
                //     text: 'start [DEVICE] connection and wait',
                //     arguments: {
                //         DEVICE: { type: ArgumentType.STRING, menu: 'devices', defaultValue: 'phone' }
                //     }
                // },
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
                // {
                //     opcode: 'isHandState',
                //     blockType: BlockType.BOOLEAN,
                //     text: '[SIDE] Hand is [STATE] of [INDEX]',
                //     arguments: {
                //         SIDE: { type: ArgumentType.STRING, menu: 'side', defaultValue: 'Right' },
                //         STATE: { type: ArgumentType.STRING, menu: 'state', defaultValue: 'Closed' },
                //         INDEX: { type: ArgumentType.STRING, menu: 'index', defaultValue: 'Closest Person' }
                //     }
                // },
                // {
                //     opcode: 'getTrackedUsers',
                //     blockType: BlockType.REPORTER,
                //     text: 'number of tracked people'
                // },

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
                {
                    opcode: 'getDirectionToCentralJoint',
                    blockType: BlockType.REPORTER,
                    text: '[JOINT] of [INDEX]',
                    arguments: {
                        JOINT: { type: ArgumentType.STRING, menu: 'torso', defaultValue: 'Head' },
                        INDEX: { type: ArgumentType.STRING, menu: 'index', defaultValue: 'Closest Person' }
                    }
                },
                {
                    opcode: 'getDirectionToSideJoint',
                    blockType: BlockType.REPORTER,
                    text: '[SIDE] [LIMB] of [INDEX]',
                    arguments: {
                        SIDE: { type: ArgumentType.STRING, menu: 'side', defaultValue: 'Right' },
                        LIMB: { type: ArgumentType.STRING, menu: 'limbs', defaultValue: 'Hand' },
                        INDEX: { type: ArgumentType.STRING, menu: 'index', defaultValue: 'Closest Person' }
                    }
                },
                {
                    opcode: 'setSkeletonColorToColor',
                    blockType: BlockType.COMMAND,
                    text: 'set skeleton color to [COLOR]',
                    arguments: {
                        COLOR: {
                            type: ArgumentType.COLOR
                        }
                    }
                },
                {
                    opcode: 'showSkeleton',
                    blockType: BlockType.COMMAND,
                    text: 'show skeleton [STATE]',
                    arguments: {
                        STATE: { type: ArgumentType.STRING, menu: 'onOff', defaultValue: 'on' }
                    }
                },
                {
                    opcode: 'setSkeletonThickness',
                    blockType: BlockType.COMMAND,
                    text: 'set skeleton thickness to [THICKNESS]',
                    arguments: {
                        THICKNESS: { type: ArgumentType.NUMBER, defaultValue: 4 }
                    }
                },                
                {
                    opcode: 'setSkeletonHead',
                    blockType: BlockType.COMMAND,
                    text: 'draw skeleton head [STATE]',
                    arguments: {
                        STATE: { type: ArgumentType.STRING, menu: 'onOff', defaultValue: 'on' }
                    }
                },
                {
                    opcode: 'drawSkeleton',
                    blockType: BlockType.COMMAND,
                    text: 'draw skeleton for [INDEX]',
                    arguments: {
                        INDEX: {
                            type: ArgumentType.STRING,
                            menu: 'index',
                            defaultValue: 'Closest Person'
                        }
                    }
                },
                {
                    opcode: 'getServerIpAddress',
                    blockType: BlockType.REPORTER,
                    text: 'server IP address',
                    allowGetBlock: true
                },
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
                        // { text: 'Z', value: 'Z' } Deprecated, rarely used in blocks
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
                        { text: 'Index Finger', value: 'HandTip' },
                        { text: 'Little Finger', value: 'LittleFinger' },
                        { text: 'Thumb', value: 'Thumb' },
                        { text: 'Hip', value: 'Hip' },
                        { text: 'Knee', value: 'Knee' },
                        { text: 'Ankle', value: 'Ankle' },
                        { text: 'Foot', value: 'Foot' }
                    ]
                },
                colorParam: {
                    acceptReporters: true,
                    items: ['color', 'saturation', 'brightness', 'transparency']
                },
                onOff: {
                   acceptReporters: true,
                    items: ['on', 'off']
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

        // console.log(`🚀 Starting ${args.DEVICE} connection and waiting...`);
        // console.log('💡 Press the red stop button to cancel if needed');

        try {
            if (args.DEVICE === 'phone') {
                await this.startAndroidServerAndWait();
                // console.log('🎉 Phone connection ready! Script will continue.');
            } else if (args.DEVICE === 'kinect') {
                await this.connectKinectAndWait();
                // console.log('🎉 Kinect connection ready! Script will continue.');
            } else {
                console.error(`❌ Unknown device: ${args.DEVICE}`);
                return; // Don't throw error for unknown device, just continue
            }
        } catch (error) {
            // Only server startup errors should reach here (not connection timeouts)
            console.error(`❌ Failed to start ${args.DEVICE} server:`, error.message);
            // console.log('💡 Check the console for details, then try again');
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

        // Combine side and limb from menus to create the joint name, e.g., "HandRight"
        const jointName = args.LIMB + args.SIDE;

        const body = this.bodies[personIndex];
        if (body && body[jointName]) {
            const joint = body[jointName];
            // Return the specific coordinate (X or Y) or 0 if it's not available
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
    getDirectionToSideJoint(args, util) {
        const spriteX = util.target.x;
        const spriteY = util.target.y;

        const personIndex = this._personIndexCache[args.INDEX] || 0;
        const jointName = args.LIMB + args.SIDE;
        const body = this.bodies[personIndex];

        if (!body || !body[jointName]) {
            return util.target.direction;
        }

        const jointX = body[jointName][0];
        const jointY = body[jointName][1];

        const dx = jointX - spriteX;
        const dy = jointY - spriteY;
        const radians = Math.atan2(dy, dx);
        const degrees = radians * 180 / Math.PI;

        return 90 - degrees; // Convert to Scratch degrees
    }

    getDirectionToCentralJoint(args, util) {
        const spriteX = util.target.x;
        const spriteY = util.target.y;

        const personIndex = this._personIndexCache[args.INDEX] || 0;
        const jointName = args.JOINT;
        const body = this.bodies[personIndex];

        if (!body || !body[jointName]) {
            return util.target.direction;
        }

        const jointX = body[jointName][0];
        const jointY = body[jointName][1];
        
        const dx = jointX - spriteX;
        const dy = jointY - spriteY;
        const radians = Math.atan2(dy, dx);
        const degrees = radians * 180 / Math.PI;

        return 90 - degrees; // Convert to Scratch degrees
    }
    isConnected(args) {
        if (args.DEVICE === 'phone') {
            return this.isAndroidConnected();
        } else if (args.DEVICE === 'kinect') {
            return this.isKinectConnected();
        }
        return false; // Default to false if the device is unknown
    }
    
    /**
     * Draw the skeleton of a person on the canvas
     * @param {object} args - block arguments
     * 
     */
    drawSkeleton (args) {
           const w = 480; // The fixed width of our drawing canvas
        const h = 360; // The fixed height of our drawing canvas

        // Always clear the canvas at the start of every frame.
        this.skeletonCtx.clearRect(0, 0, w, h);

        // If the skeleton is turned off, we're done for this frame.
        if (!this.isSkeletonVisible)
            return;

        const personIndex = this._personIndexCache[args.INDEX] || 0;
        const body = this.bodies[personIndex];

        // If no data for this person, stop.
        if (!body || !body.Head) 
            return;
        
        try {
            // --- 1. Set up the drawing styles from your class properties ---
            // Convert the stored HSV-like values to an RGB object
            const rgb = Color.hsvToRgb({
                h: this.skeletonColor * 3.6, // Convert 0-100 to 0-360
                s: this.skeletonSaturation / 100,
                v: this.skeletonBrightness / 100
            });

            // // Calculate the alpha from transparency
            // const alpha = 1 - (this.skeletonTransparency / 100);

            // Create the final rgba string for the canvas
            const color = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.8)`;

            // Use this color for all drawing
            this.skeletonCtx.fillStyle = color;            
            this.skeletonCtx.strokeStyle = color;

            // Use the line width from the class property.
            this.skeletonCtx.lineWidth = this.skeletonLineWidth;

            // --- 2. Draw the Head (if it's enabled) ---
            if (this.isHeadVisible && body.Neck) { // Also check if Neck data exists
                const headCoords = body.Head;
                const neckCoords = body.Neck;

                // Calculate the radius as the distance between the Head and Neck joints
                const dx = headCoords[0] - neckCoords[0];
                const dy = headCoords[1] - neckCoords[1];
                const radius = Math.sqrt((dx * dx) + (dy * dy));

                // Get the screen coordinates for the head's center
                const headX = headCoords[0] + w / 2;
                const headY = -headCoords[1] + h / 2;

                // Draw the circle with the calculated radius
                this.skeletonCtx.fillStyle = color;
                this.skeletonCtx.beginPath();
                this.skeletonCtx.arc(headX, headY, radius, 0, Math.PI * 2);
                //this.skeletonCtx.fill(); // I think a circle outline is better than filled, but you can easily switch this back, comment this line in and the next line out.
                this.skeletonCtx.stroke();
            }

            // --- 3. Draw the Skeleton Bones ---
            this.skeletonCtx.strokeStyle = color; // Use the dynamic color
            
            const drawBone = (jointName1, jointName2) => {
                const joint1 = body[jointName1];
                const joint2 = body[jointName2];
                
                if (joint1 && joint2) {
                    const x1 = joint1[0] + w / 2;
                    const y1 = -joint1[1] + h / 2;
                    const x2 = joint2[0] + w / 2;
                    const y2 = -joint2[1] + h / 2;
                    
                    this.skeletonCtx.beginPath();
                    this.skeletonCtx.moveTo(x1, y1);
                    this.skeletonCtx.lineTo(x2, y2);
                    this.skeletonCtx.stroke();
                }
            };
        
            // --- Draw the skeleton by connecting the "bones" ---
            
            if(!this.isHeadVisible) drawBone('Head', 'Neck'); 

            // Spine
            drawBone('Neck', 'SpineShoulder');
            drawBone('SpineShoulder', 'SpineMid');
            drawBone('SpineMid', 'SpineBase');
            
            // Torso
            drawBone('ShoulderLeft', 'SpineShoulder');        
            drawBone('ShoulderRight', 'SpineShoulder');        
                                    
            drawBone('ShoulderLeft', 'HipLeft');
            drawBone('ShoulderRight', 'HipRight');
            drawBone('HipLeft', 'SpineBase');
            drawBone('HipRight', 'SpineBase');

            // Left Arm
            drawBone('ShoulderLeft', 'ElbowLeft');
            drawBone('ElbowLeft', 'WristLeft');
            drawBone('WristLeft', 'HandLeft');
            
            // Right Arm
            drawBone('ShoulderRight', 'ElbowRight');
            drawBone('ElbowRight', 'WristRight');
            drawBone('WristRight', 'HandRight');
            
            // Left Leg
            drawBone('HipLeft', 'KneeLeft');
            drawBone('KneeLeft', 'AnkleLeft');
            drawBone('FootLeft', 'AnkleLeft');
            
            // Right Leg
            drawBone('HipRight', 'KneeRight');
            drawBone('KneeRight', 'AnkleRight');
            drawBone('FootRight', 'AnkleRight');                        
            
        } catch (e) {
            console.error("Error during skeleton draw:", e);
        }                
    } 

    // Add this method to your extension class
    setSkeletonColorToColor (args) {
        // Convert the color from the picker into an RGB object
        const rgb = Cast.toRgbColorObject(args.COLOR);
        
        // Convert the RGB object to the HSV color model
        const hsv = Color.rgbToHsv(rgb);

        // Update the extension's internal state with the new values
        this.skeletonColor = (hsv.h / 360) * 100;
        this.skeletonSaturation = hsv.s * 100;
        this.skeletonBrightness = hsv.v * 100;
    }

    showSkeleton(args) {
        this.isSkeletonVisible = (args.STATE === 'on');
    }

    setSkeletonThickness(args) {
        // Clamp the value to a reasonable range
        const thickness = Math.max(1, Math.min(args.THICKNESS, 20));
        this.skeletonLineWidth = thickness;
    }    

    setSkeletonHead(args) {
        this.isHeadVisible = (args.STATE === 'on');
    }

    getServerIpAddress() {
        // Check if the API is available on the window object
        if (!window.electronAPI) {
            return 'not available'; // Return a default value if not in Electron
        }

        // Return a Promise that resolves with the IP address
        return window.electronAPI.getAppInfo().then(info => {
            if (info && info.ipAddress) {
                return `${info.ipAddress}:8183`; // Append the port number
            }
            return 'not available';
        }).catch(() => {
            return 'error';
        });
    }
}

module.exports = Scratch3BodyBlocks;