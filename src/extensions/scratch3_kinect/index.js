const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const TargetType = require('../../extension-support/target-type');
const formatMessage = require('format-message');

/**
 * Icon svg to be displayed at the left edge of each extension block, encoded as a data URI.
 * @type {string}
 */
// eslint-disable-next-line max-len
const blockIconURI = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48dGl0bGU+a2luZWN0LWljb248L3RpdGxlPjxnIHN0cm9rZT0iIzU3NUU3NSIgZmlsbD0ibm9uZSIgZmlsbC1ydWxlPSJldmVub2RkIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Ik0yMCA4YzYuNjI3IDAgMTIgNS4zNzMgMTIgMTJzLTUuMzczIDEyLTEyIDEyLTEyLTUuMzczLTEyLTEyIDUuMzczLTEyIDEyLTEyeiIgc3Ryb2tlLXdpZHRoPSIyIi8+PGNpcmNsZSBjeD0iMjAiIGN5PSIxNCIgcj0iMyIgZmlsbD0iIzU3NUU3NSIvPjxwYXRoIGQ9Ik0yMCAxN3Y4bS00IDRoOG0tOC04aDQgNCIgc3Ryb2tlLXdpZHRoPSIyIi8+PC9nPjwvc3ZnPg==';

console.log('Kinect extension file loaded!');

/**
 * Host for the Kinect-related blocks in Scratch 3.0
 * @param {Runtime} runtime - the runtime instantiating this block package.
 * @constructor
 */
class Scratch3KinectBlocks {
    constructor (runtime) {
        console.log('Kinect extension constructor called!');
        /**
         * The runtime instantiating this block package.
         * @type {Runtime}
         */
        this.runtime = runtime;

        // Initialize tracking data
        this.bodies = {}; // Store body data by index
        this.numTracked = 0;
        this.lastEventType = null;
        
        // WebSocket connection
        this.connection = null;
        this.connectionStatus = 0; // 0 = not connected, 1 = connecting, 2 = connected
        
        // Comment out auto-connection for testing
        this._connectToKinect();
    }

    /**
     * Connect to Kinect WebSocket server
     * @private
     */
    _connectToKinect () {
        try {
            // Check if WebSocket is available
            if (typeof WebSocket === 'undefined') {
                console.warn('WebSocket not available in this environment');
                this.connectionStatus = 0;
                return;
            }
            
            this.connection = new WebSocket('ws://localhost:8181/');
            this.connectionStatus = 1;

            this.connection.onopen = () => {
                console.log('Kinect connection opened');
                this.connectionStatus = 2;
            };

            this.connection.onclose = () => {
                console.log('Kinect connection closed');
                this.connectionStatus = 0;
                // Attempt to reconnect after 5 seconds
                setTimeout(() => {
                    if (this.connectionStatus === 0) {
                        this._connectToKinect();
                    }
                }, 5000);
            };

            this.connection.onerror = (error) => {
                console.log('Kinect connection error:', error);
                this.connectionStatus = 0;
            };

            this.connection.onmessage = (e) => {
                try {
                    const obj = JSON.parse(e.data);
                    
                    // Handle different message types
                    if (obj.type === 'scene') {
                        // Scene status message
                        this.numTracked = obj.numTracked || 0;
                        console.log(`Scene update: ${this.numTracked} people tracked`);
                    } else if (obj.type === 'body') {
                        // Body data message
                        this.bodies[obj.bodyIndex] = obj;
                        console.log(`Body ${obj.bodyIndex} updated`);
                    } else if (obj.type === 'event') {
                        // Entry/exit events
                        this.lastEventType = obj.eventType;
                        console.log(`Event: person ${obj.eventType}`);
                        // Trigger Scratch event here if implemented
                    }
                } catch (error) {
                    console.error('Error parsing Kinect data:', error);
                }
            };
        } catch (error) {
            console.error('Error creating WebSocket connection:', error);
            this.connectionStatus = 0;
        }
    }

    /**
     * @returns {object} metadata for this extension and its blocks.
     */
    getInfo () {
        return {
            id: 'kinect2',
            name: formatMessage({
                id: 'kinect.categoryName',
                default: 'Kinect',
                description: 'Label for the kinect extension category'
            }),
            blockIconURI: blockIconURI,
            blocks: [
                {
                    opcode: 'getValue',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'kinect.getValue',
                        default: 'get [COORDINATE] position of [BODYPART]',
                        description: 'get coordinate position of a body part'
                    }),
                    arguments: {
                        COORDINATE: {
                            type: ArgumentType.STRING,
                            menu: 'coordinate',
                            defaultValue: 'x'
                        },
                        BODYPART: {
                            type: ArgumentType.STRING,
                            menu: 'bodyPart',
                            defaultValue: 'HandRight'
                        }
                    }
                },
                {
                    opcode: 'getValueOfPerson',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'kinect.getValueOfPerson',
                        default: 'get [COORDINATE] of [BODYPART] of person [INDEX]',
                        description: 'get coordinate of body part for specific person'
                    }),
                    arguments: {
                        COORDINATE: {
                            type: ArgumentType.STRING,
                            menu: 'coordinate',
                            defaultValue: 'x'
                        },
                        BODYPART: {
                            type: ArgumentType.STRING,
                            menu: 'bodyPart',
                            defaultValue: 'HandRight'
                        },
                        INDEX: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 1
                        }
                    }
                },
                {
                    opcode: 'getNumTracked',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'kinect.getNumTracked',
                        default: 'number of tracked people',
                        description: 'get number of people being tracked'
                    })
                },
                {
                    opcode: 'getHandState',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'kinect.getHandState',
                        default: '[HAND] hand state of person [INDEX]',
                        description: 'get hand state of specific person'
                    }),
                    arguments: {
                        HAND: {
                            type: ArgumentType.STRING,
                            menu: 'hand',
                            defaultValue: 'right'
                        },
                        INDEX: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 1
                        }
                    }
                },
                {
                    opcode: 'isHandState',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'kinect.isHandState',
                        default: '[HAND] hand is [STATE]',
                        description: 'check if hand is in specific state'
                    }),
                    arguments: {
                        HAND: {
                            type: ArgumentType.STRING,
                            menu: 'hand',
                            defaultValue: 'right'
                        },
                        STATE: {
                            type: ArgumentType.STRING,
                            menu: 'handState',
                            defaultValue: 'Closed'
                        }
                    }
                },
                {
                    opcode: 'isConnected',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'kinect.isConnected',
                        default: 'Kinect connected?',
                        description: 'check if Kinect is connected'
                    })
                },
                {
                    opcode: 'disconnect',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'kinect.disconnect',
                        default: 'disconnect from Kinect',
                        description: 'disconnect from Kinect server'
                    })
                },
                {
                    opcode: 'reconnect',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'kinect.reconnect',
                        default: 'reconnect to Kinect',
                        description: 'reconnect to Kinect server'
                    })
                }
            ],
            menus: {
                coordinate: {
                    acceptReporters: true,
                    items: [
                        {
                            text: 'x',
                            value: 'x'
                        },
                        {
                            text: 'y',
                            value: 'y'
                        },
                        {
                            text: 'z',
                            value: 'z'
                        }
                    ]
                },
                hand: {
                    acceptReporters: true,
                    items: [
                        {
                            text: 'right',
                            value: 'right'
                        },
                        {
                            text: 'left',
                            value: 'left'
                        }
                    ]
                },
                handState: {
                    acceptReporters: true,
                    items: [
                        {
                            text: 'Open',
                            value: 'Open'
                        },
                        {
                            text: 'Closed',
                            value: 'Closed'
                        },
                        {
                            text: 'Lasso',
                            value: 'Lasso'
                        },
                        {
                            text: 'Unknown',
                            value: 'Unknown'
                        },
                        {
                            text: 'NotTracked',
                            value: 'NotTracked'
                        }
                    ]
                },
                bodyPart: {
                    acceptReporters: true,
                    items: [
                        // Head and spine
                        { text: 'Head', value: 'Head' },
                        { text: 'Neck', value: 'Neck' },
                        { text: 'Spine Shoulder', value: 'SpineShoulder' },
                        { text: 'Spine Mid', value: 'SpineMid' },
                        { text: 'Spine Base', value: 'SpineBase' },
                        // Left arm
                        { text: 'Shoulder Left', value: 'ShoulderLeft' },
                        { text: 'Elbow Left', value: 'ElbowLeft' },
                        { text: 'Wrist Left', value: 'WristLeft' },
                        { text: 'Hand Left', value: 'HandLeft' },
                        { text: 'Hand Tip Left', value: 'HandTipLeft' },
                        { text: 'Thumb Left', value: 'ThumbLeft' },
                        // Right arm
                        { text: 'Shoulder Right', value: 'ShoulderRight' },
                        { text: 'Elbow Right', value: 'ElbowRight' },
                        { text: 'Wrist Right', value: 'WristRight' },
                        { text: 'Hand Right', value: 'HandRight' },
                        { text: 'Hand Tip Right', value: 'HandTipRight' },
                        { text: 'Thumb Right', value: 'ThumbRight' },
                        // Left leg
                        { text: 'Hip Left', value: 'HipLeft' },
                        { text: 'Knee Left', value: 'KneeLeft' },
                        { text: 'Ankle Left', value: 'AnkleLeft' },
                        { text: 'Foot Left', value: 'FootLeft' },
                        // Right leg
                        { text: 'Hip Right', value: 'HipRight' },
                        { text: 'Knee Right', value: 'KneeRight' },
                        { text: 'Ankle Right', value: 'AnkleRight' },
                        { text: 'Foot Right', value: 'FootRight' }
                    ]
                }
            }
        };
    }

    /**
     * Get coordinate value for a body part (closest person)
     * @param {object} args - the block arguments.
     * @param {string} args.COORDINATE - x, y, or z coordinate
     * @param {string} args.BODYPART - the body part to get position for
     * @returns {number} coordinate value
     */
    getValue (args) {
        try {
            const coordinate = args.COORDINATE;
            const bodyPart = args.BODYPART;
            
            console.log(`getValue called: ${bodyPart}.${coordinate}`);
            
            // Get body 0 (closest person)
            const body = this.bodies[0];
            if (body && body.joints && body.joints[bodyPart]) {
                const jointData = body.joints[bodyPart];
                const coordIndex = coordinate === 'x' ? 0 : coordinate === 'y' ? 1 : 2;
                return jointData[coordIndex];
            }
        } catch (error) {
            console.error('getValue error:', error);
        }
        
        // Return 0 if no data available
        return 0;
    }

    /**
     * Get coordinate value for a body part of specific person
     * @param {object} args - the block arguments.
     * @returns {number} coordinate value
     */
    getValueOfPerson (args) {
        try {
            const coordinate = args.COORDINATE;
            const bodyPart = args.BODYPART;
            const index = Math.max(0, parseInt(args.INDEX) - 1); // Convert 1-based to 0-based
            
            const body = this.bodies[index];
            if (body && body.joints && body.joints[bodyPart]) {
                const jointData = body.joints[bodyPart];
                const coordIndex = coordinate === 'x' ? 0 : coordinate === 'y' ? 1 : 2;
                return jointData[coordIndex];
            }
        } catch (error) {
            console.error('getValueOfPerson error:', error);
        }
        
        return 0;
    }

    /**
     * Get number of tracked people
     * @returns {number} number of tracked people
     */
    getNumTracked () {
        return this.numTracked;
    }

    /**
     * Get hand state of specific person
     * @param {object} args - the block arguments.
     * @returns {string} hand state
     */
    getHandState (args) {
        try {
            const hand = args.HAND;
            const index = Math.max(0, parseInt(args.INDEX) - 1);
            
            const body = this.bodies[index];
            if (body) {
                return hand === 'right' ? body.rightHandState : body.leftHandState;
            }
        } catch (error) {
            console.error('getHandState error:', error);
        }
        
        return 'Unknown';
    }

    /**
     * Check if hand is in specific state
     * @param {object} args - the block arguments.
     * @returns {boolean} true if hand is in specified state
     */
    isHandState (args) {
        const hand = args.HAND;
        const state = args.STATE;
        
        // Check closest person (body 0)
        const body = this.bodies[0];
        if (body) {
            const currentState = hand === 'right' ? body.rightHandState : body.leftHandState;
            return currentState === state;
        }
        
        return false;
    }

    /**
     * Check if Kinect is connected
     * @returns {boolean} true if connected
     */
    isConnected () {
        return this.connectionStatus === 2 && 
               this.connection && 
               this.connection.readyState === WebSocket.OPEN;
    }

    /**
     * Disconnect from Kinect server
     */
    disconnect () {
        if (this.connection && this.connection.readyState === WebSocket.OPEN) {
            this.connection.close();
            this.connectionStatus = 0;
        }
    }

    /**
     * Reconnect to Kinect server
     */
    reconnect () {
        this.disconnect();
        setTimeout(() => {
            this._connectToKinect();
        }, 100);
    }

    /**
     * Cleanup when extension is unloaded
     */
    clear () {
        if (this.connection) {
            this.connection.close();
            this.connection = null;
        }
        this.connectionStatus = 0;
    }
}

module.exports = Scratch3KinectBlocks;