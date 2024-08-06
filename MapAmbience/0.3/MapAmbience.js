/*
 * MapAmbience.js
 *
 * Register hero tokens which will be detected on change:graphic
 * Register 'ambients' which are tokens or paths
 * Tokens use bar 1 value and max for min and max volumes
 *            bar 2 value can be set to 'noloop' for single sound effects
 *            bar 2 max can be set to 'forget' for fire-once sources
 *            aura 1 radius is range in units (e.g. feet) or 'ALL' for whole map, e.g. rain, wind
 *            tooltip is track name to pull from the jukebox
 *            For 'forget' ambient sources you can add a script call such as !token-mod to trigger a visual effect
 */
const MapAmbience = (() => {


    // Constants
	const version = '0.2'; //eslint-disable-line no-unused-vars
	const NOT_POLYGONAL = "NOT_POLYGONAL";
    let debug = false;
    let scaleNumber;
    let scaleUnits;
    let snappingIncrement;

	/*
	 * Main variables
	 */
	let whoAMI;
	let currentPageId;
	let jukeboxCache = {};
	let pageAmbients = {};
	let closestHeroToAmbients = {};

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
     * Generic to-integer function
     */
    const toInt = (value) => {
        return (value && !isNaN(value)) ? parseInt(value) : 0;
    };

    /*
     * Setup global page variables
     */
    const setupGlobalVariables = () => {

        currentPageId = getPageId();
        const page = getObj("page", currentPageId);
        scaleNumber = page.get("scale_number");
        scaleUnits = page.get("scale_units");
        snappingIncrement = page.get("snapping_increment");
    }

    /*
     * Get page id
     */
    const getPageId = (msg) => {

        if(msg) {
            if(msg.selected && msg.selected.length > 0) {
                return getObj(msg.selected[0]._type, msg.selected[0]._id).get("_pageid");
            }

            let player = getObj('player', msg.playerid);
            if (playerIsGM(msg.playerid)) {
                return player.get('lastpage') || Campaign().get('playerpageid');
            }

            let psp = Campaign().get('playerspecificpages');
            if (psp[msg.playerid]) {
                return psp[msg.playerid];
            }
        }

        return Campaign().get('playerpageid');
    }

    /*
     * Get a named jukebox track
     */
    const getJukeboxTrack = (track) => {

        if(jukeboxCache[track]) {
            return jukeboxCache[track];
        }
        else {
            let jbTrack = findObjs({
                _type: "jukeboxtrack",
                title: track
            })[0];
            jukeboxCache[track] = jbTrack;
            return jukeboxCache[track];
        }
    }

    /*
     * Fade a jukebox track from one volume to another, needs to be quick as various sources may be on the move,
     * so just do it over 0.5 seconds. It is possible the intervals may clash on simultaneous moves but it should
     * be fairly rare and sort itself out on the next move...otherwise a locking and queueing mechanism would be needed
     * TODO Detect an interval already in flight?
     * We do this by the way to make the transitions less jarring as rapid token moves can cause a large change in
     * volume!
     */
    const animateVolume = (track, targetVolume) => {

        let origVolume = track.get("volume");
        const volumeGap = targetVolume - origVolume;

        if(volumeGap === 0) {
            // No change
            return;
        }

        // We'll fade from one to another in 0.5 seconds, looking for 5 steps
        // TODO Make these global variables, or allow user to set?
        const volumeStep = volumeGap / 5;

        // Create an interval to do this
        let currVolume = origVolume;
        const intervalID = setInterval(() => {

            currVolume = currVolume + volumeStep;

            // Check which way we're going, and have we made it
            if(volumeGap < 0 && currVolume <= targetVolume) {
                // We have decreased in volume to (or below) the targetVolume
                clearInterval(intervalID);
                // Set the volume to the target volume as with rounding we may be just off
                track.set("volume", targetVolume);
            }
            else if(volumeGap > 0 && currVolume >= targetVolume) {
                // We have increased in volume to (or above) the targetVolume
                clearInterval(intervalID);
                // Set the volume to the target volume as with rounding we may be just off
                track.set("volume", targetVolume);
            }
            else {
                track.set("volume", currVolume);
            }
        }, 100);
    }

    /*
     * Simple distance from point function
     */
    const distanceFromPoint = (tokenX, tokenY, ambientX, ambientY) => {

        var x = tokenX - ambientX;
        var y = tokenY - ambientY;

        return Math.sqrt( x*x + y*y );
    }

    /*
     * Calculate distance from segments of a path
     */
    const distanceFromPath = (path, tokenX, tokenY) => {

        const pointArray = JSON.parse(path.get("path"));

        // Need to check we have the right path type ONLY polygonal. The 2nd path array of values will have the
        // zero-th element set to C for ovals and Q for freehand paths
        if(pointArray[1] && ["C", "Q"].includes(pointArray[1][0])) {
            clog("distanceFromPath: Error, only polygonal paths are supported");
            return NOT_POLYGONAL;
        }

        const pathTop = path.get("top") - (path.get("height")/2);
        const pathLeft = path.get("left") - (path.get("width")/2);

        // Iterate over the point array
        let prevPoint;
        let distances = [];
        // Note: Closed polygons seem to have a 'Z' entry as the last array in the path points, can't see it documented
        // but just account for it below
        _.each(pointArray, function(point) {

            // First entry in 'value' is the array of points in the form:
            // [letter][num][num] where 'M' is first point, then subsequent points are 'L'
            if(point[0] !== "M" && point[0] !== "Z") {
                // Add the endpoint distance and a midpoint distance
                distances.push(distanceFromPoint(tokenX, tokenY, pathLeft + prevPoint[1], pathTop + prevPoint[2]));

                const left = (pathLeft + prevPoint[1] + pathLeft + point[1]) / 2;
                const top = (pathTop + prevPoint[2] + pathTop + point[2]) / 2;
                const segmentDist = distanceFromPoint(tokenX, tokenY, left, top);

                clog("- segmentDist: " + segmentDist + ", left: " + left + ", top: " + top + ", point: " + point);

                distances.push(segmentDist);
            }
            prevPoint = point;
        });
        // Add the last point, which will actually be held in prevPoint
        if(prevPoint[0] !== "Z") {
            distances.push(distanceFromPoint(tokenX, tokenY, pathLeft + prevPoint[1], pathTop + prevPoint[2]));
        }

        return Math.min.apply(Math, distances);
    }

    /*
     * Get the distance in scaled units
     */
    const getUnitDistance = (graphic, ambient) => {

        //clog("getUnitDistance: " + JSON.stringify(graphic));

        let pixelDistance = Infinity;
        if(ambient.representsPath) {
            const pathObj = getObj("path", ambient.representsPath);
            if(!pathObj) {
                clog("- Unable to find path for: " + ambient.representsPath)
                return;
            }
            else {
                pixelDistance = distanceFromPath(pathObj, graphic.get("left"), graphic.get("top"));
                clog("- Pixel distance from path: " + pixelDistance);
                // Check our path is good
                if(distanceFromPath === NOT_POLYGONAL) {
                    // We have alerted this above
                    clog("getUnitDistance: Returning as path is not polygonal");
                }
            }
        }
        else {
            pixelDistance = distanceFromPoint(graphic.get("left"), graphic.get("top"), ambient.left, ambient.top);
        }

        // Need to convert this based on page scale, units, snapping increment etc.
        const page = getObj("page", currentPageId);

        // Note, we knock off half the token size to allow the area of influence to be the edge of the token,
        // because 'left' and 'top' are to the centre of the token so make the token half it's width closer to
        // sources for a more realistic user experience
        const gridSpaceDist = (pixelDistance/70) - (graphic.get("width") / 70 / 2);
        return Math.round(gridSpaceDist * scaleNumber / snappingIncrement);
    }

    /*
     * See if this is a hero token, e.g. is represented by a character controlled by someone
     * TODO Should we allow hero tokens to be 'registered' for games without a character sheet?
     */
    const checkHeroToken = (graphic) => {

        const name = graphic.get("name");
        if(name) {
            clog("- Processing: " + name);
        }
        else {
            return;
        }

        // Is this a hero token? If 'represents' is defined, find the 'character and check the 'controlledby' field
        const represents = graphic.get("represents");
        if(represents) {
            const character = getObj("character", represents);
            const controlledBy = character.get("controlledby");
            clog("- controlledBy: " + controlledBy);
            if(controlledBy !== "") {
                const controlledByArray = controlledBy.split(",");
                if(controlledByArray.length === 1 && playerIsGM(controlledByArray[0])) {
                    clog("- Ignoring: " + name + " as this is controlled by the GM");
                    return;
                }
                clog("- Adding: " + name + " to hero tokens");
                pageAmbients.heroTokensIdArray.push(graphic.id);
                pageAmbients.heroTokensArray.push(graphic);
                return graphic;
            }
            else {
                clog("- Ignoring: " + name + " as this is not controlled by a player");
            }
        }
    }

    /*
     * Store how close any hero is to any ambience so we can see if volume change is required
     */
    buildClosestHeroToAmbient = (ambientSource) => {

        // Iterate over hero tokens and find their distance, ignoring whole map ambiences
        if(!ambientSource.isWholeMap) {
            closestHeroToAmbients[ambientSource.id] = Infinity;
            _.each(pageAmbients.heroTokensArray, function(heroToken) {
                updateClosestHeroToAmbient(heroToken, ambientSource);
            });
            //clog("- Closest distance for " + ambientSource.name + " is " + closestHeroToAmbients[ambientSource.id]);
        }
    }

    /*
     * Store how close any hero is to any ambience so we can see if volume change is required
     */
    buildClosestHeroToAmbients = () => {

        _.each(pageAmbients.ambientSources, function(ambientSource) {
            // Iterate over hero tokens and find their distance, ignoring whole map ambiences
            buildClosestHeroToAmbient(ambientSource);
        });
    }

    /*
     * Update closest hero to ambient if either hero token or ambient token moves
     */
    updateClosestHeroToAmbient = (heroToken, ambientSource) => {

        const distance = getUnitDistance(heroToken, ambientSource);
        closestHeroToAmbients[ambientSource.id] = Math.min(closestHeroToAmbients[ambientSource.id], distance);
    }

    /*
     * Build the entrire ambient state
     */
    const buildAmbientState = () => {

        clog("buildAmbientState: currentPageId: " + currentPageId);

        // Fairly simple here, just run through ambientSources and stop them playing, so on a page change everything
        // is reset and back to an initial state
        _.each(pageAmbients.ambientSources, function(value, key) {
            clog("- Stopping: " + value.track);
            let jbTrack = findObjs({
                _type: "jukeboxtrack",
                title: value.track
            })[0];
            jbTrack.set({ playing: false, softstop: false, volume: 0});
        });

        // Create new object to hold data
        pageAmbients = {
            heroTokensIdArray: [],
            heroTokensArray: [],
            ambientSources: {}
        }

        // Get all graphics on the page
        const graphics = findObjs({
            _type: "graphic",
            _pageid: currentPageId,
        });

        // 1. Iterate over all graphics
        _.each(graphics, function(graphic) {

            const name = graphic.get("name");
            if(name) {
                clog("- Processing: " + name);
            }
            else {
                return;
            }

            // 2. Is this a hero token, if 'represents' is defined, find the 'character and check the controlled by field'
            if(!checkHeroToken(graphic)) {
               clog("- Ignoring: " + name + " as is not controlled by a player");
            }

            // 3. Check if the graphic is an ambient source, it's name will start with 'Ambient' and the track will
            // be in the tooltip
            if(name.startsWith("Ambient")) {
                const track = graphic.get("tooltip");
                if(!track) {
                    clog("- Warning: token with name: " + name + " has no track in the tooltip field")
                }
                else {
                    let jbTrack = getJukeboxTrack(track);

                    if(!jbTrack) {
                        clog("- Warning: Track name: " + track + " assigned to: " + name + " does NOT exist");
                    }
                    else {
                        clog("- Adding ambient source: " + name);
                        // Get the location
                        const top = graphic.get("top");
                        const left = graphic.get("left");
                        // Now get the aura which represents the range of the ambient
                        const ambientRadius = graphic.get("aura1_radius");

                        // Make the auras more transparent so they do not dominate the map
                        const ambientTint = graphic.get("aura1_color");
                        if(ambientTint !== "transparent" && ambientTint.length === 7) {
                            graphic.set("aura1_color", ambientTint + "70");
                        }

                        const isWholeMap = ambientRadius.toUpperCase() === "ALL";
                        const ambientRadiusNum = toInt(ambientRadius);

                        // Now get the min and max volume from bar 1
                        const minVolume = graphic.get("bar1_value");
                        const maxVolume = graphic.get("bar1_max");

                        // Now get the loop boolean from bar2_value, and set it into the track
                        const bar2Value = graphic.get("bar2_value");
                        const bar3Value = graphic.get("bar3_value");
                        const loop = bar2Value.toLowerCase() !== "noloop";
                        jbTrack.set("loop", loop);
                        // See if this is a 'oane and done' ambient like a trap
                        const forget = graphic.get("bar2_max").toLowerCase() === "forget";

                        // See if we represent a path
                        let representsPath;
                        if(bar3Value && bar3Value.startsWith("-")) {
                            representsPath = bar3Value;
                        }

                        if(isNaN(minVolume) || isNaN(maxVolume)) {
                            clog("- Warning: Either Bar 1 Value (Min Volume: " + minVolume + " or Bar 1 Max (Max Volume): " + maxVolume + " is not set..");
                        }
                        else {
                            // TODO, radius could be explicitly set to zero or negative, we'll end up processing it, but
                            // it will never trigger BUT if this script gets cleverer then *maybe* we'll have some sort of
                            // cross-source triggers...

                            // We have enough information to store this record
                            clog("- Adding ambient source: " + name + ", id: " + graphic.id);
                            pageAmbients.ambientSources[graphic.id] = {
                                name: name,
                                id: graphic.id,
                                graphic: graphic,
                                left: left,
                                top: top,
                                loop: loop,
                                forget: forget,
                                track: track,
                                isWholeMap: isWholeMap,
                                representsPath: representsPath,
                                ambientRadius: +ambientRadiusNum,
                                minVolume: +minVolume,
                                maxVolume: +maxVolume
                            }
                        }
                    }
                }
            }
        });

        // Build our 'how close is each hero token to the ambients', this is a map of ambients (ids) and holds the
        // closest distance to a hero token, it's a bit heavyweight but we 'self-maintain' it on hero token moves
        buildClosestHeroToAmbients();

        // Resolve our sources and set everything going
        resolveAmbientSources();
    }

    /*
     * We call this either when the ambient state is rebuilt OR there is a graphics move we are interested in
     */
    const resolveAmbientSources = (graphic, isAmbient) => {

        clog("resolveAmbientSources: currentPageId: " + currentPageId + ", graphic: " + graphic + ", isAmbient: " + isAmbient);

        // Check up front if we are a moving ambient source
        if(graphic && isAmbient) {
            let ambientSource = pageAmbients.ambientSources[graphic.id];
            clog("- Ambient source moved: " + ambientSource.name);
            buildClosestHeroToAmbient(ambientSource);
            _.each(pageAmbients.heroTokensArray, function(heroToken) {
                resolveAmbientSource(ambientSource, heroToken, false);
            });

        }
        else {
            // Basically iterate over our collection and start playing all our ambients. We initially set the volume
            // to zero, then for whole map ones we set the volume to minVolume and for non-whole map ones we work
            // out the distance from our hero tokens
            _.each(pageAmbients.ambientSources, function(ambientSource, key) {
                resolveAmbientSource(ambientSource, graphic, isAmbient);
            });
        }
    }

    /*
     * Calculate all the locations and proximities etc.
     */
    const resolveAmbientSource = (ambientSource, graphic, isAmbient) => {

        const jbTrack = getJukeboxTrack(ambientSource.track);
        if(!graphic) {
            // If this is NOT a graphics change, e.g. a hero token or ambient move then setup the track and if
            // it is a whole map ambient then set it playing UNLESS it is a forgettable loop tracked as that is
            // basically triggered
            if(ambientSource.loop && !ambientSource.forget) {
                jbTrack.set({playing: true, softstop: false, volume: 0});
                if(ambientSource.isWholeMap) {
                    clog("- Playing whole map ambient: " + ambientSource.track);
                    animateVolume(jbTrack, ambientSource.minVolume);
                }
            }

            // Resolve our hero positions as this comes from a 'one-off' resolve request, e.g. page change or
            // manual 'reset' command (via !mapam buildAmbientState)
            _.each(pageAmbients.heroTokensArray, function(heroToken) {
                resolveAmbientSource(ambientSource, heroToken, false);
            });
        }
        else if(!ambientSource.isWholeMap && !isAmbient) {

            // This IS a hero token move so calculate all our ambient sources if we are NOT a whole map ambient.
            //  As Roll20 does not allow us to send audio individually we will have to work out the HIGHEST volume
            // by proximity and any tokens further away from a triggered source who move will be discarded so we
            // don't get audio fluctuating as different tokens move
            buildClosestHeroToAmbient(ambientSource)
            //buildClosestHeroToAmbients();

            let distance = getUnitDistance(graphic, ambientSource);
            clog("- Hero token: " + graphic.get("name") + " is " + distance + scaleUnits + " from ambient: " + ambientSource.name);

            // See if we are in the ambient radius
            // TODO: We have a slight issue here as we calculate 'true' distance so we can intersect a grid cell
            // TODO: which is half-full of 'influence' as it were...maybe nudge the radius check by 10%...hmmm...
            const closestHeroDist = closestHeroToAmbients[ambientSource.id];
            if(distance <= ambientSource.ambientRadius || closestHeroDist <= ambientSource.ambientRadius) {

                // Also we see whether another hero token is closer to the ambient source in which case we can skip this
                if(closestHeroDist <= distance) {
                    // We can ignore this as another hero is closer than we are
                    clog("- Resetting as another hero is " + closestHeroToAmbients[ambientSource.id] + scaleUnits +" away");
                    // Return acting as 'continue' here
                    //return;

                    // We as a hero token may have 'jumped' entirely out of the radius BUT another hero token IS
                    // within the radius, so force the distance to that hero token and process volume
                    distance = closestHeroDist;
                }

                clog("- Hero token: " + graphic.get("name") + " is within the ambient radius");
                // If we are EXACTLY on the radius then nudge the distance up by 1 just to ensure the volume
                // ticks up slightly
                //distance = distance === ambientSource.ambientRadius ? distance++ : distance;
                // See how far we are within the radius and therefore what the volume should be set to
                const howFarIn = (1 - (distance / ambientSource.ambientRadius)).toFixed(2);
                // So if we were 55' inside of a 60' radius then we are 91% of the radius AWAY from the centre,
                // or more reasonably 9% INTO the ambient field (0.91 and 0.09 respectively)
                // To calculate volume, say from 5 to 20, that would then be ((20 - 5) * 0.09) + 5
                let volume = Math.round((ambientSource.maxVolume - ambientSource.minVolume) * howFarIn) + ambientSource.minVolume;
                // If we are just on the edge of the radius then volume would be zero, so just nudge it
                if(distance === ambientSource.ambientRadius && volume === 0 && ambientSource.maxVolume !== 0) {
                    volume = 1;
                }
                // The jbTrack should already be playing at 0 volume, so set the volume ONLY if the current
                // volume is < what we think it should be, IF it is greater, some other hero is closer, actually NO
                // we may be moving away...soooo.....
                clog("- Setting volume to: " + volume);
                animateVolume(jbTrack, volume);
                //jbTrack.set("volume", volume);
                // If we are not looping (and not forgotten), we also have to play
                //if(graphic && !ambientSource.loop && ambientSource.forget !== "forgotten") {
                if(graphic && ambientSource.forget !== "forgotten") {
                    clog("- Trigger: " + ambientSource.name);
                    jbTrack.set({playing: true, softstop: false});
                    if(ambientSource.forget) {
                        clog("- Forgetting: " + ambientSource.name);
                        // For fire-once events we can also fire a macro stored in GMNotes
                        let gmnotes = ambientSource.graphic.get("gmnotes");
                        if(gmnotes) {
                            gmnotes = unescape(gmnotes).replace(/<[^>]*>?/gm, '');
                            clog("- Sending: " + gmnotes);
                            sendChat("MapAm", gmnotes);
                        }
                        ambientSource.forget = "forgotten";
                    }
                }
            }
            else {
                // If we have moved out of radius then may need to process reducing volume, depending of proximity
                // of other tokens
                if(closestHeroDist > ambientSource.ambientRadius) {
                    clog("- All heroes are outside radius, setting volume to 0");
                    //jbTrack.set("volume", 0)
                    animateVolume(jbTrack, 0);
                }
            }
        }
    }

    /*
     * Graphics change event, only fires on left or top change
     */
    const graphicsChange = (graphic, prev) => {

         clog("graphicsChange");

        // A hero token has moved
        if(pageAmbients.heroTokensIdArray.includes(graphic.id)) {
            // A hero token has moved
            resolveAmbientSources(graphic, false);
        }
        else if(graphic.get("name").startsWith("Ambient")) {
            // An ambient source has moved, update its dictionary entry
            if(pageAmbients.ambientSources[graphic.id]) {
                pageAmbients.ambientSources[graphic.id].top = graphic.get("top");
                pageAmbients.ambientSources[graphic.id].left = graphic.get("left");
                resolveAmbientSources(graphic, true);
            }
        }
    }

    /*
     * Graphics add event
     * TODO This does not work as when this function fires the 'name' of the token is not set
     */
    /*
    const graphicsAdd = (graphic) => {

        clog("graphicsAdd: " + JSON.stringify(graphic));

        if(!checkHeroToken(graphic)) {
           clog("- Ignoring new graphic: " + graphic.get("name") + " as is not controlled by a player");
        }
        else {
            const isAmbient = graphic.get("name").startsWith("Ambient");
            if(isAmbient) {
                // New ambient dropped, rebuild the state
                buildAmbientState();
            }
            resolveAmbientSources(graphic, isAmbient);
        }
    }
    */

    /*
     * Debug on/off command
     */
    const setDebug = (msg, args) => {
        if(["true", "false"].includes(args[2])) {
            debug = state.MapAmbience.debug = args[2] === "true";
            clog("Mapambience debug is: " + debug, true, true);
        }
        else {
            clog("Usage: !mapam setDebug <true|false>", true, true);
        }
    }

    /*
     * Operations dictionary
     */
    const operations = {
        "setDebug": setDebug,
        "buildAmbientState": buildAmbientState
    };

    /*
     * General message handling function
     */
    const chatMessage = (msg) => {
        if(msg.type === 'api') {
            const args = msg.content.split(/\s+/);
            if (args[0].toLowerCase() === '!mapam') {

                whoAMI = (getObj('player', msg.playerid) || {get:()=>'API'}).get('_displayname');
                const arg = args[1];

                // Look up our operation function and invoke it
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
     *
     */
    pageChange = (campaign) => {

        currentPageId = campaign.get('playerpageid');
        buildAmbientState();
    }

    /*
     * Event handling callbacks
     */
    const registerEventHandlers = () => {

        on('chat:message', chatMessage);
        on('change:graphic:left', graphicsChange);
        on('change:graphic:top', graphicsChange);
        //on('add:graphic', graphicsAdd);
        on('change:campaign:playerpageid', pageChange);

        if(!state.MapAmbience) {
            state.MapAmbience = {
                debug: true
            };
        }

        // Set global variables such as debug, page-specific grid size etc.
        debug = state.MapAmbience.debug;
        setupGlobalVariables();
        // Build the state and set things running
        buildAmbientState();

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

