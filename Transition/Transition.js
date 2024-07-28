/*
 * Transition.js
 *
 * A script to animate transitions on page elements, specifically:
 * - Transparency of shapes and paths
 * - Jukebox track fade in/out
 * - Daylight brightness fade in/out with presets (code stolen from another script, but not sure where)
 * - 'Wrapping' another macro call by transitioning arguments
 *
 * Caveat: I am not a JavaScript programmer so I am aware there are many more convenient constructions in the
 *         language that I probably haven't used. However, I do hope that it is well-commented and the code is
 *         readable!
 */
const Transition = (() => {

    // Constants
	const version = '0.2'; //eslint-disable-line no-unused-vars
    const NO_SELECTION = 1;
    const BAD_SELECTION = 2;
    const NO_OPERATION = 3;
    const ZERO_OR_UNPARSEABLE = 4;
    let debug = false;

	/*
	 * Main variables
	 */
	let whoAMI;
	let runningIntervals = {};
	let jbFadeCache = {};

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
            text = "Transition: " + text;
        }

        // Log with timestamp as we are doing asynchronous stuff
        var time = new Date();
        var timeStr =
            ("0" + time.getHours()).slice(-2)   + ":" +
            ("0" + time.getMinutes()).slice(-2) + ":" +
            ("0" + time.getSeconds()).slice(-2);

        log(timeStr + ": " + indent + text);

        if(chat) {
            sendChat("Transition", "/w " + whoAMI + " " + text);
        }
    }

    /*
     * Debug on
     */
    const debugOn = () => {

        clog("Debug ON", true, true);
        debug = state.Transition.debug = true;
    }

    /*
     * DEbug off
     */
    const debugOff = () => {

        clog("Debug OFF", true, true);
        debug = state.Transition.debug = false;
    }

    /*
     * Promise-based sleep function
     *
     * Usage: await sleep(ms)
     */
    const sleep = (ms) => {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /*
     * Generic to-integer function
     */
    const toInt = (value) => {
    	return (value && !isNaN(value)) ? parseInt(value) : 0;
    };

    /*
     * Generic function to determine if an argument is set and represents a non-zero number
     */
    const getNonZero = (value) => {

        if(value === undefined || isNaN(value)) {
            return undefined;
        }
        const numValue = Math.abs(+value);
        if(numValue === 0) {
            return undefined;
        }
        return numValue;
    }

    /*
     * Run setInterval, stores intervalId in global collection for kill operation
     */
    const noresolve = () => {};
    const runSetInterval = (fn, ms, resolve) => {

        const intervalId = setInterval(fn, ms);
        runningIntervals[intervalId] = resolve || noresolve;
        return intervalId;
    }

    /*
     * Wrapper for clear interval to remove interval id from global collection of intervals
     */
    const runClearInterval = (intervalId) => {

        // Clear the interval
        clearInterval(intervalId);
        // Remove the entry
        delete runningIntervals[intervalId];
    }

    /*
     * Utility function to kill all running intervals, really just in case we end up with an infinite interval
     */
    const killAllIntervals = () => {

        clog("killAllIntervals");

        Object.keys(runningIntervals)

        for (var intervalId of Object.keys(runningIntervals)) {
            clog("- clearing interval: " + intervalId);
            clearInterval(intervalId);
            // Resolve the intervals promise if it has one
            runningIntervals[intervalId]();
        }
        // Reset running intervals object
        runningIntervals = {};
        clog("- All intervals killed!", true, true);
    }

	/*
	 * --------------
	 * Main functions
	 * --------------
	 */

    /*
     * Compile the incoming msg or args into a standard format when using with a selection of objects on the page
     */
    processSelectionAndArgs = (msg, args, ignoreOp) => {

        clog("processSelectionAndArgs");

        // First arg must be 'in' or 'out', unless we are ignoring the op
        let operation;
        let increment;
        let ms;
        if(!ignoreOp) {
            if(args[2]) {
                if(["in", "out"].includes(args[2])) {
                    operation = args[2]
                }
                else {
                    clog("- First argument must be 'in' or 'out'", true);
                    return NO_OPERATION;
                }
            }
            else {
                clog("- First argument must be 'in' or 'out'", true);
                return NO_OPERATION;
            }

            // May have other arguments for increment and ms
            increment = getNonZero(args[3]);
            if(args[3] && args[3] !== "reset" && increment === undefined) {
                clog("- Zero or unparseable arg for increment: " + args[3]);
                return ZERO_OR_UNPARSEABLE;
            }

            ms = getNonZero(args[4]);
            if(args[4] && args[4] !== "reset" && ms === undefined) {
                clog("- Zero or unparseable arg for ms: " + args[4]);
                return ZERO_OR_UNPARSEABLE;
            }
        }

        let selectedIds = [];
        let selectedTypes = [];
        if(msg.selected && msg.selected.length > 0) {
            // Processing selected objects
            for(let i=0; i<msg.selected.length; i++) {
                // Check for text or path
                if(["path", "text"].includes(msg.selected[i]._type)) {
                    // Add to array
                    selectedIds.push(msg.selected[i]._id);
                    selectedTypes.push(msg.selected[i]._type);
                }
                else {
                    clog("- Error: selected objects must be text or path only: " + msg.selected[i]._id + ", " + msg.selected[i]._type, true);
                    return BAD_SELECTION;
                }
            }
        }
        else {
            clog("- No shapes or text selected", true);
            return NO_SELECTION;
        }

        return {
            operation: operation,
            increment: increment,
            ms: ms,
            selectedIds: selectedIds,
            selectedTypes: selectedTypes,
            reset: args[args.length-1] === "reset"
        };
    }

    /*
     * Wrapper class to adjust path objects
     */
    function PathWrapper(path) {
        this.obj = path;
        this.stroke = path.get("stroke").substring(0, 7);
        this.fill = path.get("fill").substring(0, 7);
        // We ignore any explicit setting to 'transparent' as it is impossible to derive a colour from it
        this.setStroke = this.stroke !== "transpa";
        this.setFill = this.fill !== "transpa";
    }

    PathWrapper.prototype.reset = function (operation) {
        // If we are resetting then depending on operation depends how we set the colour opacity
        // Note: We currently do not support transitioning between opacities, just solid to transparent and vice-versa
        if(operation === "in") {
            // Resetting in means setting to transparent
            this.setFill && this.obj.set("fill", this.fill.substring(0, 7) + "00");
            this.setStroke && this.obj.set("stroke", this.stroke.substring(0, 7) + "00");
        }
        if(operation === "out") {
            // Resetting out means setting to solid
            this.setFill && this.obj.set("fill", this.fill.substring(0, 7));
            this.setStroke && this.obj.set("stroke", this.stroke.substring(0, 7));
        }
    };

    PathWrapper.prototype.set = function (index) {
        this.setFill && this.obj.set("fill", this.fill + index.toString(16).padStart(2, "0"));
        this.setStroke && this.obj.set("stroke", this.stroke + index.toString(16).padStart(2, "0"));
    }

    PathWrapper.prototype.canProcess = function () {
        return this.setStroke || this.setFill;
    }

    /*
     * Wrapper class to adjust text objects
     */
    function TextWrapper(text) {
        this.obj = text;
        this.color = text.get("color").substring(0, 7);
        this.setColor = this.color !== "transpa";
    }

    TextWrapper.prototype.reset = function (operation) {

        if(operation === "in") {
            // Resetting in means setting to transparent
            this.setColor && this.obj.set("color", this.color.substring(0, 7) + "00");
        }
        if(operation === "out") {
            // Resetting out means setting to solid
            this.setColor && this.obj.set("color", this.color.substring(0, 7));
        }
    };

    TextWrapper.prototype.set = function (index) {
        this.setColor && this.obj.set("color", this.color + index.toString(16).padStart(2, "0"));
    }

    TextWrapper.prototype.canProcess = function () {
        return this.setColor;
    }

    /*
     * Wrapper class to adjust graphic objects
     * Not used at present
     */
    function GraphicWrapper(graphic) {
            this.obj = graphic;
    }

    /*
     * Wrapper dictionary
     */
    const Wrappers = {
        "path": (path) => { return new PathWrapper(path); },
        "text": (text) => { return new TextWrapper(text); },
        "graphic": (graphic) => { return new GraphicWrapper(graphic); },
    }

    /*
     * Transparify implementation for paths and text
     */
    transparifyImpl = (operation, incomingId, increment, ms, reset) => {

        clog("transparifyImpl: operation: " + operation + ", incomingId: " + incomingId + ", increment: " + increment + ", ms: " + ms + ", reset: " + reset);

        // We may not always have incoming type, so need to derive that
        var obj;
        var objType;

        obj = getObj("path", incomingId);
        objType = "path";

        if(obj === undefined) {
            obj = getObj("text", incomingId);
            objType = "text";

            if(obj === undefined) {
                // Something we can't handle?
                clog("- Unable to process object type for: " + incomingId + ", ignoring");
                return;
            }
        }

        // If we haven't qualified our ids with an in|out operation then we default them
        // This is a hangover from previous macros I didn't want to break
        // TODO Probably remove this and force operation definition in macro
        if(operation === undefined) {
            clog("- Operation is undefined, defaulting to 'out' for path and 'in' for text!");
            operation = objType === "path" ? "out" : "in";
        }

        // If after all this the obj cannot be found then bail...
        if(obj === undefined) {
            clog("- Object with id: " + incomingId + " is not a path or text object");
            return;
        }

        // We now pass all the info into the Promise, create our wrapper
        const wrapper = Wrappers[objType](obj);

        return new Promise(resolve => {

            // Unlikely, but if the user has set stroke AND fill to transparent then we cannot do anything...
            if(!wrapper.canProcess()) {
                clog("- Shape has fill and stroke set to transparent, nothing we can do here...");
                resolve("Full transparency, no transition possible");
                return;
            }

            // Reset the transparency
            if(reset) {
                wrapper.reset(operation);
                clog("- Reset complete: " + incomingId);
                resolve("Reset");
                return;
            }

            const indices = {
                "in": { start: 0, end: 255, increment: increment ? increment : 4, test: (i) => { return i >= 255 } },
                "out": { start: 255, end: 0, increment: increment ? -increment : -4, test: (i) => { return i <= 0 } }
            }

            let index = indices[operation].start;
            let intervalId = runSetInterval(function() {

                if(index === indices[operation].start) {
                    clog("- Transparify starting: " + intervalId);
                }
                // This is where actual objects are set
                wrapper.set(index);

                index += indices[operation].increment;

                if(indices[operation].test(index)) {
                    runClearInterval(intervalId);
                    resolve(intervalId);
                    clog("- Transparify complete: " + intervalId);
                }
            }, ms ? ms : 80, resolve);

            clog("- Interval set and running");
        });
    }

    /*
     * Transparify one or more selected objects
     * Usage: !transition selection out ?{Reset||reset}
     * Or:    !transition selection out increment ?{Reset||reset}
     * Or:    !transition selection out increment ms ?{Reset||reset}
     */
    transparifySelection = (msg, args) => {

        clog("transparifySelection");
        const selectionObj = processSelectionAndArgs(msg, args);

        if(typeof selectionObj === 'number') {
            // Error, we've already alerted this so just return
            return;
        }

        // From a selection we only support simultaneous fading in/out, so |-delimit them to pass through
        const selectedArgs = selectionObj.selectedIds.join("|");
        clog("- selectionObj.selectedIds: " + selectionObj.selectedIds);

        // We are synthesizing an array of args here, we only support simultaneous fading in/out, so |-delimit them
        // to pass through to the sequencer
        let newArgs = [args[0], args[1], selectionObj.operation, selectionObj.increment, selectionObj.ms, selectionObj.selectedIds.join("|")]

        // Allow ms interval and opacity endpoint to be set?
        // TODO

        if(selectionObj.reset) {
            // Need to add 'reset' back in at end
            newArgs.push("reset");
        }
        clog("- newArgs: " + newArgs);
        transparifySequence(msg, newArgs);
    }

    /*
     * Run a sequence of transparifys with a sequence of IDs, some |-delimited for simultaneous transparency which
     * can be separated by a numeric ms delay
     *
     * Usage: !transition transparify-sequence -NqDQYV4iRyLpwhcX3cY|-Nq81VUKHMbNM-iKaOJc 2000 -NqDQYzZMMJqQVVe9yBE 5000
     * or, to reset
     * !transition transparify-sequence -NqDQYV4iRyLpwhcX3cY|-Nq81VUKHMbNM-iKaOJc 2000 -NqDQYzZMMJqQVVe9yBE 5000 reset
     *
     * HOWEVER: Note that ids can be colon delimited as id:increment:ms e.g.:
     *          -NqDQYV4iRyLpwhcX3cY:4:80|-Nq81VUKHMbNM-iKaOJc:2:120
     */
    transparifySequence = (msg, args) => {

        clog("transparifySequence");

        if(args.length <= 2) {
            clog("- No ids provided");
            return;
        }

        let operation, increment, ms;
        let startIndex = 2;
        if(["in", "out"].includes(args[2])) {
            // We are coming in via a selection
            operation = args[2];
            increment = args[3];
            ms = args[4];
            startIndex = 5;
        }

        //clog("- increment: " + increment + ", ms: " + ms);

        var idArray = [];
        const reset = args[args.length-1] === "reset";
        const offset = reset ? -1 : 0; // Knock the args down to exclude 'reset' if present

        // Correction to ID testing from convo with Timmaugh as not all IDs will always start with -N
        let allIdsRx = new RegExp(`^(${getAllObjs().map(o => o.id).join('|')})`, '');

        for(var i=startIndex; i<args.length + offset; i++) {

            // Parse the array, creating a holding object
            if(isNaN(args[i])) {
                // An ID, may be |-delimited series of ids OR could be a macro execution or a jukebox fade, or a daylight fade...
                // We let it go through into the ids and process in the sequence further down
                let ids = args[i].split("|");

                // Test to see if we have actual ids, this is a bit lazy but grab the first id and split on colons and
                // see if first element of array appears in our big regex of all ids. This does assume that all |-delimited
                // ids are actual ids, but we'll bail later if theres an unfindable id
                if(allIdsRx.test(ids[0].split(":")[0])) {
                    // We have an actual id, no further action
                }
                else {
                    // A command or a comment
                    ids = [args[i]];
                }
                clog("- Var ids: " + ids);

                // Peek into the loop to see if we have a delay next
                if(!isNaN(args[i+1])) {
                    // We have a delay, use it and increment the array index i
                    log("- Delay at i+1: " + args[i+1]);
                    idArray.push({
                        ids: ids,
                        delay : toInt(args[i+1])
                    });
                    i+=1;
                }
                else {
                    idArray.push({ ids: ids });
                }
            }
            else {
                // Delay at beginning
                idArray.push({
                    ids: [],
                    delay: toInt(args[i])
                });
            }
        }

        // Set up our linked callbacks to process the sequence
        var thenCallbacks = [];
        var callbackCounter = 1;

        _.each(idArray, function(idObj) {

            if(idObj.ids) {

                const fn = async function(thenCallback) {
                    var promises = [];

                    // For each id we need to transition, kick them off and collect their promises in an array,
                    // note that this is for simultaneous transitions such as a selection or |-delimited ids
                    // Further note that exec, fade-jb and fade-dl are ASYNCHRONOUS, e.g. they will run in
                    // PARALLEL with id sequences...
                    // The reason for this is that a delay can be added to force synchronicity, but it would mean
                    // creating e.g. exec-sync: and fade-jb-sync tokens to parse....
                    _.each(idObj.ids, function(id) {

                        if(id.toLowerCase().startsWith("wrap-macro:")) {
                            // The 'id' is a macro execution, so intercept that here.
                            // It won't have a promise, but it could be followed by a delay which will be processed
                            // as normal below, so we fire and forget the macro and return at this point
                            const macroName = id.slice(11).split(":")[0];

                            // If we are doing a reset then bail early
                            if(reset) {
                                clog("- WARNING: Ignoring macro: " + macroName + " as we are doing a reset");
                                return;
                            }

                            // Synthesize our arguments:
                            // wrap-macro:Torch:1:500:1|5:3|30
                            // to mimic:
                            // !transition wrap-macro <macro> <increment> <milliseconds> <from|to> [from|to] …
                            let params = ["A", "B"].concat(id.slice(11).split(":"));
                            wrapMacro(msg, params);

                            // We cannot execute a macro directly so try and grab and execute its content
                            // This will not work if the macro invokes another macro
                            // TODO Recursively parse macros?
                            const macroObj = findObjs({ type: "macro", name: macroName })[0];
                            if(macroObj) {
                                // Actually execute the macro by sending its 'body' to chat
                                sendChat('Transition', macroObj.get("action"));
                            }
                            else {
                                clog("- WARNING: Unable to find macro: " + macroName + ", ignoring and continuing...");
                            }
                        }
                        else if(id.toLowerCase().startsWith("exec-macro:")) {
                            // We cannot execute a macro directly so try and grab and execute its content
                            // This will not work if the macro invokes another macro
                            // TODO Recursively parse macros?
                            const macroName = id.slice(11);

                            // If we are doing a reset then bail early
                            if(reset) {
                                clog("- WARNING: Ignoring macro: " + macroName + " as we are doing a reset");
                                return;
                            }

                            const macroObj = findObjs({ type: "macro", name: macroName })[0];
                            if(macroObj) {
                                // Actually execute the macro by sending its 'body' to chat
                                sendChat('Transition', macroObj.get("action"));
                            }
                            else {
                                clog("- WARNING: Unable to find macro: " + macroName + ", ignoring and continuing...");
                            }
                        }
                        else if(id.toLowerCase().startsWith("fade-jb:")) {
                            // Jukebox fade, we expect a string formatted as:
                            // Track:StartVolume:EndVolume:Increment:Ms
                            // where the last two can default to 2 and 800 respectively
                            // fade-jb:LoTR5e_OpeningMix:0:12 OR
                            // fade-jb:LoTR5e_OpeningMix:0:12:2 OR
                            // jbfade:LoTR5e_OpeningMix:0:12:2:800
                            // Pad the beginning with two dummy array entries to mimic !transition fade-jukebox X Y Z
                            let params = ["A", "B"].concat(id.slice(8).split(":"));

                            fadeJukebox(msg, params, reset);
                        }
                        else if(id.toLowerCase().startsWith("fade-dl:")) {
                            // Daylight fade, expect a string formatted as:
                            // TargetBrightness:Delta:Ms where last two will default to 0.04 and 80 respectively
                            // fade-dl:0.5 OR
                            // fade-dl:0.5:0.05 OR
                            // fade-dl:0.5:0.05:80
                            // Note that brightness has constants of: day, overcast, dusk, moonlight & night which
                            // can also be used e.g. daylight:dusk
                            // Pad the beginning with two dummy array entries to mimic !transition fade-daylight X Y Z
                            let params = ["A", "B"].concat(id.slice(8).split(":"));

                            if(reset) {
                                // Slightly tricky one here as daylight fade just fades from current value to a new
                                // value, so we just set it to 1.0 (brightest)
                                params[2] = 1.0;
                            }

                            fadeDaylight(msg, params);
                        }
                        else if(allIdsRx.test(id)) {
                            // Ok, we are here with an actual id, which might be in the form id, id:operation,
                            // id:operation:increment or id:operation:increment:ms, do some splittage to find out.
                            // (Note that we declared increment and ms way back at the top of this function for
                            // 'selected' mode, and transparifyImpl will default them if not set, but we don't want
                            // to override them if they have come in from a selection, so check for colons then process)
                            if(id.includes(":")) {
                                const idBits = id.split(":");
                                id = idBits[0];
                                operation = idBits[1];
                                increment = Math.abs(+idBits[2]); // May be undefined, so will default in transparifyImpl
                                ms = Math.abs(idBits[3]); // May be undefined, so will default in transparifyImpl
                            }

                            const promise = transparifyImpl(operation, id, increment, ms, reset);
                            clog("- Running promise for transparify, operation: " + operation + ", id: " + id);
                            promises.push(promise);
                        }
                        else if(id.startsWith("#")) {
                            // Comment, we ignore
                        }
                        else {
                            // TODO We cannot break out of _.each so should we pre-process?
                            clog("- Unparseable id or token: " + id + ", ignoring");
                        }
                    });

                    // Await the promises and process any delay
                    await Promise.all(promises).then(async function(a) {
                        if(idObj.delay) {
                            // Note that if we are resetting we just force the sleep times to 0 to speed things up
                            clog("- Delaying " + (reset ? 0 : idObj.delay) + "ms" + (reset ? " as resetting" : ""));
                            await sleep(reset ? 0 : idObj.delay).then(function() {
                                clog("- Sleep complete");
                                if(thenCallbacks[callbackCounter]) {
                                    thenCallbacks[callbackCounter++]();
                                }
                                else {
                                    clog("- All operations complete");
                                }
                            });
                        }
                        else {
                            // Move on to the next sequence item, if it exists
                            if(thenCallbacks[callbackCounter]) {
                                thenCallbacks[callbackCounter++]();
                            }
                            else {
                                clog("- All operations complete");
                            }
                        }
                    }, function(b) {
                        clog("- Promise rejected, aborting: " + b);
                    });
                }

                thenCallbacks.push(fn);
            }
        });

        clog("- Number of thenCallbacks: " + thenCallbacks.length);

        // Invoke the first callback which will the in turn call all the successive callbacks
        thenCallbacks[0]();
    }

    /*
     * Transition Daylight
     * Usage: !transition fade-daylight <value 0.0 to 1.0> [increment, default:0.04] [milliseconds, default: 80]
     * E.g.:  !transition fade-daylight 0.5
     * Or:    !transition fade-daylight 0.5 0.1
     * Or:    !transition fade-daylight 0.5 0.1 100
     */
    fadeDaylight = (msg, args) => {

        clog("fadeDaylight");

        // Allow some presets for easy macro-ing
        const presets = {
            day: 1.0,
            overcast: 0.8,
            dusk: 0.4,
            moonlight: 0.2,
            night: 0.0
        }

        // Force args[2] to a string, as can be a number if coming from a reset, see if is a constant in our presets,
        // and if not re-numberify it!
        let target = presets[("" + args[2]).toLowerCase()];
        if(target === undefined) {
            target = +args[2];
        }

        const delta = +args[3] || 0.04;
        const ms = +args[4] || 80;

        fadeDaylightImpl(delta, target, ms);
    }

    /*
     * Transition Daylight Impl
     *  daylight:0.01,0.85,80,-NryMkNlqWMvu4F3dMda
     */
    fadeDaylightImpl = (delta, target, ms) => {

        clog("fadeDaylightImpl");

        let page = getObj("page", Campaign().get("playerpageid"));
        const start = page.get("daylightModeOpacity");

        if(!delta) {
            clog("- Error: Delta cannot be zeo or undefined!", true, true);
            return;
        }

        if(!ms) {
           clog("- Ms delay cannot be zeo or undefined!", true, true);
           return;
        }

        if(target === undefined) {
            clog("- Target opacity cannot be undefined!", true, true);
            return;
        }
        if(target === start) {
            clog("- Target == start, nothing to do!");
            return;
        }

        if(target > start && delta < 0) {
            delta *= -1;
        }
        if(start > target && delta > 0) {
            delta *= -1;
        }

        let current = start;
        // We create a dummy token so that we can twitch its position as it seems the daylight setting is
        // not always visible to the players unless something moves on the page to force an update. We remove this
        // once the interval has run
        let token = createObj('graphic', {
            subtype: "token",
            imgsrc: "",
            layer: "objects",
            pageid: page.id,
            width: 10,
            height: 10
        });

        let tokenLeft = token.get("left");
        let oscillator = 1;

        const intervalId = runSetInterval(() =>  {

            current += delta;

            if((target > start && current >= target) || (target < start && current <= target)) {
                runClearInterval(intervalId);
                token.set("left", tokenLeft);
                page.set({
                    dynamic_lighting_enabled: true,
                    daylight_mode_enabled: true,
                    explorer_mode: "off",
                    lightupdatedrop: false,
                    daylightModeOpacity: target,
                    force_lighting_refresh: true
                });
                token.remove();
                clog("- Complete");
            }
            else {
                page.set({
                    dynamic_lighting_enabled: true,
                    daylight_mode_enabled: true,
                    explorer_mode: "off",
                    lightupdatedrop: false,
                    daylightModeOpacity: current,
                    force_lighting_refresh: true
                });
                // Try and force lighting update
                token.set("left", token.get("left")+oscillator);
                oscillator *= -1;
            }
        }, ms);
    }

    /*
     * Fade jukebox track
     */
    fadeJukebox = (msg, args, reset) => {

        clog("fadeJukebox: " + args);

        let p = {
            trackName : args[2],
            startVolume : toInt(args[3]),
            endVolume : toInt(args[4]),
            increment : Math.abs(toInt(args[5])) || 2,
            ms : Math.abs(toInt(args[6])) || 800
        };

        if(p.trackName === undefined || p.startVolume === undefined || p.endVolume === undefined) {
            clog("- Error: One of track: " + p.track + ", start volume: " + p.startVolume + ", end volume: " + p.endVolume + " is undefined", true, true);
            return;
        }

        var jbTrack = findObjs({
            _type: "jukeboxtrack",
            title: p.trackName
        })[0];

        if(jbTrack === undefined) {
            clog("- Error: Unable to find track name: " + p.trackName, true, true);
            return;
        }

        // Add to track cache, we do this because on a reset we reverse the track operation BUT it is quite likely
        // that a track may be faded in at start of sequence and then out at end of sequence, so only process a
        // a track once per sequence
        jbFadeCache[p.trackName]

        clog("- Parameters: " + JSON.stringify(p));

        // Check which way we are going
        if(p.startVolume === p.endVolume) {
            clog("- Start volume = end volume, returning");
            return;
        }

        let operation = p.startVolume < p.endVolume ? "in" : "out";

        if(reset) {
            clog("- Resetting jukebox fade");
            // If we are resetting then set end volume to start volume
            p.endVolume = p.startVolume;
            // Set delay to 10ms so we reset quickly
            p.ms = 10;
            // We don't really care about increment as we will only go round the interval once, but we do need to flip
            // the in-out operation
            operation = operation === "in" ? "out" : "in";
        }

        let volume = p.startVolume;
        jbTrack.set("volume", p.startVolume);
        jbTrack.set("playing", true);
        jbTrack.set("softstop", false);

        const operations = {
            "in": { increment: p.increment, final: p.endVolume, playing: true, complete: (i) => { return i >= p.endVolume } },
            "out": { increment: -p.increment, final: p.endVolume, playing: false, complete: (i) => { return i <= p.endVolume } }
        };

        const interval = runSetInterval(function() {

            const thisInterval = interval;
            volume += operations[operation].increment;

            if(operations[operation].complete(volume)) {
                jbTrack.set("volume", operations[operation].final);
                jbTrack.set("playing", operations[operation].playing);
                runClearInterval(thisInterval);
                clog("- fadeJukebox complete");
            }
            else {
                jbTrack.set("volume", volume);
            }
        }, p.ms);
    }

    /*
     * Wrap a macro and transition one or more values in its command line
     *
     * As we are firing macros off, these are, by their nature, asynchronous. So we do NOT create a promise here
     * As per jukebox and daylight fade synchronicity can be enforced by adding a delay after this operation
     *
     * Usage: !transition wrap-macro TheMacro increment ms [from|to] [from|to] ...
     *        Macro to be wrapped must use arg1 arg2 arg3 etc., e.g. a macro called Torch that has this:
     *        !token-mod --on has_bright_light_vision emits_bright_light emits_low_light --set bright_light_distance#20 low_light_distance#20 dim_light_opacity#20 lightColor#transparent --ids -Nw5Miq31d2mgAkMeJmm
     *        becomes, for example:
     *        !token-mod --on has_bright_light_vision emits_bright_light emits_low_light --set bright_light_distance#arg1 low_light_distance#arg2 dim_light_opacity#20 lightColor#transparent --ids -Nw5Miq31d2mgAkMeJmm
     *        and is invoked as:
     *        !transition wrap-macro Torch 1 80 5|20 20|5 ...
     *
     * NOTE: For ease of this implementation we only allow a 'global' increment and ms delay to be applied to multiple 'arg' variables.
     * NOTE: You can 're-use' arguments e.g. arg1 could be specified in multiple places in the macro text
     * NOTE: The wrapped macro must use page element ids, because this is an api invoking an api there is NO msg.selected, and
     * NOTE: SPECIFICALLY for TokenMod you must set the config item that players can use --ids because the api which calls the macro does not pass the isGM test!
     */
    wrapMacro = (msg, args) => {

        clog("wrapMacro");

        const macroName = args[2];
        // De-sign the increment, we will adjust direction below
        const increment = Math.abs(+args[3]);
        const ms = Math.abs(+args[4]);

        // Check our arguments
        if(macroName === undefined || increment === undefined || ms === undefined) {
            clog("- Error, undefined parameter: macroName: " + macroName + ", increment: " + increment + ", ms: " + ms, true, true);
            return;
        }

        if(isNaN(args[3]) || isNaN(args[4]) || increment === 0 || ms === 0) {
            clog("- Error, non-number or zero value parameter: increment: " + increment + ", ms: " + ms, true, true);
            return;
        }

        // Check the macro exists
        const macroObj = findObjs({ type: "macro", name: macroName })[0];
        if(macroObj === undefined) {
            clog("- Error: Unable to find macro: " + macroName, true, true);
        }

        let tuples = [];
        for(let i=5; i<args.length; i++) {

            const tupleArgs = args[i].split("|");

            // We need at least two args, from and to
            if(tupleArgs.length !== 2) {
                clog("- Error: Tuple: " + args[i] + " requires two |-delimited args for 'from' and 'to'", true, true);
                return;
            }

            // Check we have numbers
            if(isNaN(tupleArgs[0]) || isNaN(tupleArgs[1])) {
                clog("- Error: Tuple element: from: " + tupleArgs[0] + " or to: " + tupleArgs[1] + " is not numeric", true, true);
                return;
            }

            // Prepare our tuple
            let tuple = { from: +tupleArgs[0], to: +tupleArgs[1]}
            // Adjust increment direction per tuple
            tuple.increment = tuple.from > tuple.to ? -increment : increment;
            tuple.complete = false;
            tuples.push(tuple);
        }

        // Now parse our macro and check the arg substitution matches our tuples
        let macroText = macroObj.get("action");
        clog("- macroText: " + typeof(macroText));

        // Do an initial parse of the action text to see how many args we are dealing with, then ensure we have
        // that many tuples at lease. For ease at present we only allow arg1..arg9
        let macroArgs = 0;
        for(let i=1; i<=9; i++) {
            if(macroText.includes("++arg" + i + "++")) {
                macroArgs++;
            }
        }

        if(macroArgs === tuples.length) {
            // All fine
        }
        else if(macroArgs > tuples.length) {
            // More args defined in macro than we have tuples
            clog("- Error: Number args in macro: " + macroArgs + " but " + tuples.length + " transition tuples defined", true, true);
            return;
        }
        else {
            // Fewer args than tuples defined, we can run this, but warn the user. The reason for doing this from
            // a user perspective is that you may want to just execute a macro x number of times, e.g. a token-mod
            // macro that did a --move 1u or similar
            clog("- Warning: Number args in macro: " + macroArgs + " but " + tuples.length + " transition tuples defined", false, true);
        }

        // As we are firing macros off, these are, by their nature, asynchronous. So we do NOT create a promise here
        // As per jukebox and daylight fade synchronicity can be enforced by adding a delay after this operation
        const interval = runSetInterval(function() {

            const thisInterval = interval;

            // So the body of this is to start applying the values from our tuples, bearing in mind that some tuples
            // may end before others...
            // Check if tuple needs to do work
            let thisMacroText = macroText;
            let tuplesComplete = 0;
            for(let i=0; i<tuples.length; i++) {

                let tuple = tuples[i];

                if(tuple.complete) {
                    tuplesComplete++;
                    clog("- Tuple: arg" + (i+1) + " already complete, count: " + tuplesComplete);
                    continue;
                }

                if((tuple.increment < 0 && tuple.from <= tuple.to) ||
                   (tuple.increment > 0 && tuple.from >= tuple.to)) {
                    // Completed, force final value to be 'to' value for completeness
                    clog("- Tuple: arg" + (i+1) + " complete");
                    thisMacroText = thisMacroText.replaceAll("++arg" + (i+1) + "++", tuple.to);
                    tuple.complete = true;
                    tuplesComplete++;
                }
                else {
                    // Work to do
                    thisMacroText = thisMacroText.replaceAll("++arg" + (i+1) + "++", tuple.from);
                    tuple.from += tuple.increment;
                }
            }

            // Fire off the macro string
            clog("- macro text: " + thisMacroText);
            sendChat("GM", thisMacroText);

            if(tuplesComplete === tuples.length) {
                // All done
                clog("- wrapMacro complete");
                runClearInterval(thisInterval);
            }
        }, ms);
    }

    /*
     * Helper: Vertically space a selection of text objects and justify
     */
    verticalLayoutText = (msg, args) => {

        clog("verticalLayoutText");

        const selectionObj = processSelectionAndArgs(msg, args, true);

        if(typeof selectionObj === 'number') {
            // Error, we've already alerted this so just return
            return;
        }

        const space = +args[2] || 20;
        const justify = (args[3] && args[3].toLowerCase()) || "left";

        // Only going to process text objects, grab them into an array
        // We don't know the order of selectionObj so need to sort them ourselves

        clog("- selectionObj: " + JSON.stringify(selectionObj));

        let textMetrics = {};
        for(let i=0; i<selectionObj.selectedIds.length; i++) {
            const id = selectionObj.selectedIds[i];
            //clog("- selectedTypes:" + selectionObj.selectedTypes[i]);
            if(selectionObj.selectedTypes[i] === "text") {
                let textObj = getObj("text", id);
                textMetrics[id] = { top: textObj.get("top"), height: textObj.get("height"), obj: textObj };
            }
        }

        // We have a map of ids to their tops and heights, now get a sorted list of keys
        const sortedKeys = Object.keys(textMetrics).sort((a, b) => textMetrics[a].top - textMetrics[b].top);

        // Iterate over sorted keys
        let calculatedTop = 0
        let masterLeft = 0;
        let masterWidth = 0;
        let masterRight = 0;
        for(let i=0; i<sortedKeys.length; i++) {

            const textMetric = textMetrics[sortedKeys[i]];

            // Now we keep a running total and move our text based on heights and spacer, skipping the first one
            // as that will always be our baseline, so we just record that as the top
            if(i === 0) {
                calculatedTop = textMetric.top;
                masterLeft = textMetric.obj.get("left");
                masterWidth = textMetric.obj.get("width");
                masterRight = masterLeft + masterWidth;
            }
            else {
                // We add the previous text obj height + the spacer to calculate our new top
                calculatedTop += textMetrics[sortedKeys[i-1]].height + space;
                textMetric.obj.set("top", calculatedTop)

                // Now set the justification, its odd because obj.left is actually the centre of the text!
                const width = textMetric.obj.get("width");
                if(justify === "left") {
                    //clog("- Justifying left");
                    let trueLeft = masterLeft - (masterWidth / 2)
                    let newLeft = trueLeft + (width / 2)
                    textMetric.obj.set("left", newLeft)
                }
                else if(justify === "right") {
                    //clog("- Justifying right");
                    let trueLeft = masterLeft + (masterWidth / 2)
                    let newLeft = trueLeft - (width / 2)
                    textMetric.obj.set("left", newLeft)
                }
                else if(justify === "center" || justify === "centre") {
                    // Easy one. just line up all the 'lefts' as obj.left is the centre of the text!
                    textMetric.obj.set("left", masterLeft)
                }
                else {
                    clog("- Unknown justification: " + justify);
                }
            }
        }
    }

    /*
     * Helper: Vertically space a selection of text objects and justify
     */
    hozCentreText = (msg, args) => {

        clog("hozCentreText");
        const selectionObj = processSelectionAndArgs(msg, args, true);

        if(typeof selectionObj === 'number') {
            // Error, we've already alerted this so just return
            return;
        }

        const shadowOffset = toInt(args[2]);

        let textMetrics = {};
        for(let i=0; i<selectionObj.selectedIds.length; i++) {
            const id = selectionObj.selectedIds[i];
            //clog("- selectedTypes:" + selectionObj.selectedTypes[i]);
            if(selectionObj.selectedTypes[i] === "text") {
                let textObj = getObj("text", id);

                if(textObj) {
                    const pageId = textObj.get("pageid");
                    const textWidth = textObj.get("width");
                    const pageWidth = getObj("page", pageId).get("width") * 70;
                    textObj.set("left", (pageWidth/2));

                    if(shadowOffset) {
                        // Re-get the object
                        textObj = getObj("text", id);
                        // Create a shadow object based on our text object
                        const attributes = ["top","left","width","height","text","font_size","rotation","color","font_family","layer","controlledby"];
                        const offsetAttrs = ["top","left"];
                        let attrObj = { pageid: pageId }
                        _.each(attributes, function(attr) {
                            if(offsetAttrs.includes(attr)) {
                                attrObj[attr] = textObj.get(attr) + shadowOffset;
                            }
                            else {
                                attrObj[attr] = textObj.get(attr);
                            }
                        });
                        attrObj["color"] = "#00000080";
                        let shadowTextObj = createObj("text", attrObj);
                        //toBack(shadowTextObj);
                        toFront(textObj);
                    }
                }
            }
        }
    }

    /*
     * Helper: Show the ids for a number of selected objects
     */
    markupSelection = (msg, args) => {

        // Create a text object with the selected object ids for ease of writing complex transitions
        let selectionObj = processSelectionAndArgs(msg, args, true);

        if(typeof selectionObj === 'number') {
            // Error, we've already alerted this so just return
            return;
        }

        for(let i=0; i<selectionObj.selectedIds.length; i++) {
            let obj = getObj(selectionObj.selectedTypes[i], selectionObj.selectedIds[i]);

            let top = obj.get("top") - (obj.get("height")/2);
            let left = obj.get("left") - (obj.get("width")/2)

            let text = createObj('text', {
                top: top,
                left: left,
                font_family: "Arial",
                font_size: 16,
                color: "#000000",
                text: selected.selectedIds[i],
                layer: obj.get("layer"),
                pageid: obj.get("pageid")
            });
        }
    }

    /*
     * Helper: Testing
     */
    test = async (msg, args) => {

        clog("test");
        sendChat("GM", "!token-mod --set rotation#+90")
    }

    /*
     * Operations dictionary
     */
    const operations = {

        "selection": transparifySelection,
        "sequence": transparifySequence,
        "fade-daylight": fadeDaylight,
        "fade-jukebox": fadeJukebox,
        "wrap-macro": wrapMacro,
        "kill": killAllIntervals,
        "vertical-layout-text": verticalLayoutText,
        "hoz-centre-text": hozCentreText,
        "markup-selection": markupSelection,
        "debug-on": debugOn,
        "debug-off": debugOff,
        "test": test,
    };

    /*
     * General message handling function
     */
    const chatMessage = (msg) => {
        if(msg.type === 'api') {
            const args = msg.content.split(/\s+/);
            if (args[0].toLowerCase() === '!transition') {

                whoAMI = (getObj('player', msg.playerid) || {get:()=>'API'}).get('_displayname');
                const arg = args[1].toLowerCase();

                //clog("chatMessage: who: " + whoAMI + ", arg: " + arg);

                // Look up our operation function and invoke it (pass 3rd arg of reset if exists, although not all
                // 'standalone' functions support it)
                if(operations[arg]) {
                    operations[arg](msg, args, args[args.length-1] === "reset");
                }
                else {
                    clog("Transition - Unknown operation: " + arg, true);
                }
            }
        }
    }

    /*
     * Event handling callbacks
     */
    const registerEventHandlers = () => {
        on('chat:message', chatMessage);

        if( !state.Transition ) {
            state.Transition = {
                debug: false
            };
        }
        else {
            debug = state.Transition.debug;
        }
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
on('ready', Transition.RegisterEventHandlers);
