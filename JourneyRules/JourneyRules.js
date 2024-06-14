/*
 * JourneyRules.js
 *
 */
const JourneyRules = (() => {

    // Constants
	const version = '0.2'; //eslint-disable-line no-unused-vars
    let debug = true;

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
            text = "JourneyRules: " + text;
        }

        // Log with timestamp as we are doing asynchronous stuff
        var time = new Date();
        var timeStr =
            ("0" + time.getHours()).slice(-2)   + ":" +
            ("0" + time.getMinutes()).slice(-2) + ":" +
            ("0" + time.getSeconds()).slice(-2);

        log(timeStr + ": " + indent + text);

        if(chat) {
            sendChat("JourneyRules", "/w " + whoAMI + " " + text);
        }
    }

    /*
     * Debug on
     */
    const debugOn = () => {

        clog("Debug ON", true, true);
        debug = state.JourneyRules.debug = true;
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
     *
     */
    const newJourney = (msg, args) => {
          
        clog("newJourney");

        const journeyLength = toInt(args[2]);
        if(journeyLength === 0) {
            sendChat("Journey", "New journey requires estimated length (total number of hexes)");
            return;
        }

        state.JourneyRules = {
            days: 0,
            who: "",
            fatigueDC: 0,
            journeyLength: journeyLength
        };
        
        sendChat("Journey", "On the road again...");      
    }
    
    /*
     *
     */
    const characters = ["Wax", "Donum", "Maggie"];
        
    /*
     *
     */
    const howFar = (msg, args) => {
        
        clog("howFar");
        const result = getNonZero(args[2]);
        if(result === undefined) {
            clog("- Numeric argument required for 'howFar', returning", true);
            return;
        }
        
        let message = "You travel for ";
        let days = 0;
        if(result <= 5) {
            message += "one";
            days = 1;
        }
        else if(result <= 10) {
            message += "two";
            days = 2;
        }
        else if(result < 15) {
            message += "three";
            days = 3;
        }
        else if(result >= 20) {
            message += "seven";
            days = 7;
        }
        else if(result >= 15) {
            message += "four";
            days = 4;
        }
        
        // See who event happens to
        let who = randomInteger(3);
        clog("- who: " + who);
        
        state.JourneyRules.days += days;

        // Journey may have ended
        if(state.JourneyRules.days >= state.JourneyRules.journeyLength) {
            message += (state.JourneyRules.journeyLength - state.JourneyRules.days) + " days and have reached your destination.";
            return;
        }

        state.JourneyRules.who = characters[who-1];
        
        message += " days, when suddenly something happens to " + characters[who-1] + ", roll a Perception check and 1D20... (Elapsed: " + state.JourneyRules.days + " days)";
        
        sendChat("Journey", message);
    }
    
    const terrainTypes = { hard: 20, road: 10, open: 15 };
    
    const eventTypes = [
        { Event: "a Terrible Misfortune, if WIS check failed, DEX save DC15, on fail reduced to 0 HP else lose half HP", DC: 3, Days: 0 },
        { Event: "a Terrible Misfortune, if WIS check failed, DEX save DC15, on fail reduced to 0 HP else lose half HP", DC: 3, Days: 0 },
        { Event: "Despair, if WIS check failed then Disadvantage on next Ability Check, Saving Throw or Attack", DC: 2, Days: 0 },
        { Event: "Despair, if WIS check failed then Disadvantage on next Ability Check, Saving Throw or Attack", DC: 2, Days: 0 },
        { Event: "some Ill Choices", DC: 2, Days: 0 },
        { Event: "some Ill Choices", DC: 2, Days: 0 },
        { Event: "a Mishap", DC: 1, Days: 0 },
        { Event: "a Mishap", DC: 1, Days: 0 },
        { Event: "a Mishap", DC: 1, Days: 0 },
        { Event: "a Mishap", DC: 1, Days: 0 },
        { Event: "a Mishap", DC: 1, Days: 0 },
        { Event: "a Mishap", DC: 1, Days: 0 },
        { Event: "a Mishap", DC: 1, Days: 0 },
        { Event: "a Mishap", DC: 1, Days: 0 },
        { Event: "a Short Cut", DC: 1, Days: -1 },
        { Event: "a Short Cut", DC: 1, Days: -1 },
        { Event: "a Short Cut", DC: 1, Days: -1 },
        { Event: "a Chance-meeting", DC: 1, Days: 0 },
        { Event: "a Chance-meeting", DC: 1, Days: 0 },
        { Event: "a Joyful Sight", DC: 0, Days: 0 },
    ];
    
    /*
     *
     */
    const resolveEvent = (msg, args) => {

        const perception = getNonZero(args[2]);
        if(perception === undefined) {
            clog("- Numeric argument required for 'resolveEvent' perception, returning", true);
            return;
        }

        const event = getNonZero(args[3]);
        if(event === undefined) {
            clog("- Numeric argument required for 'resolveEvent' event, returning", true);
            return;
        }

        const terrainType = args[4];
        if(!Object.keys(terrainTypes).includes(terrainType)) {
            clog("- Unknown terrain type: " + terrainType + ", returning", true);
            return;
        }
        
        let message = ""
        if(perception < terrainTypes[terrainType]) {
            // Check failed
            message += state.JourneyRules.who + " has failed their check, ";
        }
        else {
            // Success
            message += state.JourneyRules.who + " has succeeded, ";
        }
        
        const eventObj = eventTypes[event-1];
        message += "you encounter " + eventObj.Event;
        state.JourneyRules.fatigueDC += eventObj.DC;
        state.JourneyRules.days += eventObj.Days;
        if(eventObj.Days < 0) {
            message += " and save a days travel!";
        }
        
        sendChat("Journey", message);
    }

    /*
     *
     */
    const endJourney = (msg, args) => {

        let message = "You have reached your destination after " + state.JourneyRules.days + " days travel. You are tired and weary...";
        message += "Make a CON save, DC: " + (10+state.JourneyRules.fatigueDC) + " or take a level of exhaustion which will take two full days of rest to recover from...";

        sendChat("Journey", message);
    }

    /*
     * Operations dictionary
     */
    const operations = {

        "new": newJourney,
        "howfar": howFar,
        "resolveevent": resolveEvent,
        "end": endJourney
    };

    /*
     * General message handling function
     */
    const chatMessage = (msg) => {
        if(msg.type === 'api') {
            const args = msg.content.split(/\s+/);
            if (args[0].toLowerCase() === '!jr') {

                whoAMI = (getObj('player', msg.playerid) || {get:()=>'API'}).get('_displayname');
                const arg = args[1].toLowerCase();

                // Look up our operation function and invoke it (pass 3rd arg of reset if exists, although not all
                // 'standalone' functions support it)
                if(operations[arg]) {
                    operations[arg](msg, args);
                }
                else {
                    clog("JourneyRules - Unknown operation: " + arg, true);
                }
            }
        }
    }

    /*
     * Event handling callbacks
     */
    const registerEventHandlers = () => {
    
        on('chat:message', chatMessage);

        if( !state.JourneyRules ) {
            state.JourneyRules = {
               
            };
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
on('ready', JourneyRules.RegisterEventHandlers);
