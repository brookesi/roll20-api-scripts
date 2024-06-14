/*
 * MapAmbience.js
 *
 * Register hero tokens which will be detected on change:graphic
 * Register 'ambients' which are tokens or paths
 * Tokens use bar 1 value and max for min and max volumes and
 *            bar 2 value is range in units or 'MAP' for whole map, e.g. rain, wind
 *            name is track name to pull from the jukebox
 * Path uses stroke colour for min and max volumes followed by 00
 */
const MapAmbience = (() => {


    // Constants
	const version = '0.2'; //eslint-disable-line no-unused-vars
    let debug = true;
    let heroTokens;
    let ambientPaths;
    let ambientPoints;
    let globalPoints;

	/*
	 * Main variables
	 */
	let whoAMI;

    /*
     * Utility functions
     */

    /*
     * General logging function with timestamp, as we have a lot of asynchronous stuff going on
     * Usage: clog("Starting"); at start of function and clog("- Something something"); when logging within
     * function. Indents by stack depth
     */
    const clog = (text, chat, force) => {

        // Check for debug flag
        if(!debug && !force) {
            return;
        }

        // Ok, this is probably horribly inefficient and could easily break, but I like indented log lines
        let myStack = [];
        const stack = new Error().stack.split("\n");
        for(let i=0; i<stack.length; i++) {
            const words = stack[i].split(" ");
            if(stack[i].includes("(apiscript") && !stack[i].includes("at apiscript") && !stack[i].includes("at Array.fn")) {
                // One of our functions
                myStack.push(stack[i]);
            }
        }

        const indent = myStack.length-3 > 0 ? '    '.repeat(myStack.length-3) : '';

        if(!text.startsWith("- ")) {
            text = "MapAmbience: " + text;
        }

        // Log with timestamp as we are doing asynchronous stuff
        var time = new Date();
        var timeStr =
            ("0" + time.getHours()).slice(-2)   + ":" +
            ("0" + time.getMinutes()).slice(-2) + ":" +
            ("0" + time.getSeconds()).slice(-2);

        log(timeStr + ": " + indent + text);

        if(chat) {
            sendChat("MapAmbience", "/w " + whoAMI + " " + text);
        }
    }

    /*
     * Math functions
     */
    const segmentDistance = (x, y, x1, y1, x2, y2) => {

        let A = x - x1;
        let B = y - y1;
        let C = x2 - x1;
        let D = y2 - y1;

        let dot = A * C + B * D;
        let len_sq = C * C + D * D;
        let param = -1;
        if (len_sq != 0) //in case of 0 length line
          param = dot / len_sq;

        let xx, yy;

        if (param < 0) {
        xx = x1;
        yy = y1;
        }
        else if (param > 1) {
        xx = x2;
        yy = y2;
        }
        else {
        xx = x1 + param * C;
        yy = y1 + param * D;
        }

        let dx = x - xx;
        let dy = y - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /*
     *
     */
    const distanceFromPoint = (tokenX, tokenY, ambientX, ambientY) => {

        var x = tokenX - ambientX;
        var y = tokenY - ambientY;

        return Math.sqrt( x*x + y*y );
    }

    /*
     *
     */
    const distanceFromPath = (tokenX, tokenY) => {

        var path = findObjs({
            _type: 'path',
            _id: "-O-H4cOk7cKGlROsp5G6"
        })[0];

        const pointArray = JSON.parse(path.get("path"));

        // Iterate over the point array
        let prevPoint = ["", "", ""];
        let distances = [];
        _.each(pointArray, function(point) {

            // First entry in 'value' is the array of points in the form:
            // [letter][num][num] where 'M' is first point, then subsequent points are 'L'
            if(point[0] !== "M") {
                distances.push(segmentDistance(tokenX, tokenY, prevPoint[1], prevPoint[2], point[1], point[2]));
            }
            prevPoint = point;
        });

        return Math.min(distances);
    }

    /*
     *
     */
    const registerHeroTokens = (msg) => {

        heroTokens = {};
        _.each(msg.selected, function(selected) {

            heroTokens[selected._id] = getObj("graphic", selected._id);
        });
    }

    /*
     *
     */
    const registerAmbients = (msg) => {

        ambients = {}

        _.each(msg.selected, function(selected) {

            const ambientObj = getObj("graphic", selected._id);
            if(!ambientObj) {
                // May be a path
                ambientObj = getObj("path", selected._id);
            }
            ambients[selected._id] = getObj("graphic", selected._id);
        });
    }

    /*
     *
     */
    const graphicsChange = (obj, prev) => {

        // See if its a token and a change we care about
        clog("graphicsChange: " + prev);
        let distFromPath;
        if(Object.keys(heroTokens).includes[obj.id] && (prev["left"] || prev["top"])) {
            // Change of position
            distFromPath = distanceFromPath(obj.get("left"), obj.get("top"));
            clog("- Distance from path (px): " + distanceFromPath);
            clog("- Distance from path (grid): " + Math.round(distanceFromPath));
        }
        else {
            // Not interested
            return;
        }

        // We know how far we are from a path
    }

    /*
     * Operations dictionary
     */
    const operations = {

        "test": test,
        "registerTokens": registerTokens,
        "registerAmbients": registerAmbients
    };



    /*
     * General message handling function
     */
    const chatMessage = (msg) => {
        if(msg.type === 'api') {
            const args = msg.content.split(/\s+/);
            if (args[0].toLowerCase() === '!mapam') {

                whoAMI = (getObj('player', msg.playerid) || {get:()=>'API'}).get('_displayname');
                const arg = args[1].toLowerCase();

                // Look up our operation function and invoke it (pass 3rd arg of reset if exists, although not all
                // 'standalone' functions support it)
                if(operations[arg]) {
                    operations[arg](msg, args);
                }
                else {
                    clog("MapAmbience - Unknown operation: " + arg, true);
                }
            }
        }
    }

    /*
     * Event handling callbacks
     */
    const registerEventHandlers = () => {

        on('chat:message', chatMessage);
        on('change:graphic', graphicsChange);
        clog("Ready", false, true);
    };

    /*
     * Object 'methods' to return
     */
    return {
        RegisterEventHandlers: registerEventHandlers
    };

})();

/*
 * Runtime
 */
on('ready', MapAmbience.RegisterEventHandlers);

