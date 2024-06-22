const MassCombatRules = (() => {

    // Constants
    const version = '0.2'; //eslint-disable-line no-unused-vars
    let debug = true;

    /*
     * Main variables
     */
    let whoAMI;

    // Global variables    
    let currentStrength = 0;
    let whisper = "/w GM ";
    const notTokenActions = [
        "⚔️-Calculate-Forces",
        "⚔️-Regenerate-Macros",
        "⚔️-Roll-Strength-ABS",
        "⚔️-Show-Macros-To-Players",
        "⚔️-Update-Unit-Data",
        "⚔️-Whisper",
    ];

    // Function lookup table
    let functionTable = {}

    /*
     *
     */
    const macroDef = {
        "⚔️-Apply-Damage": "!mcr applyDamage",
        "⚔️-Apply-Damage-And-Morale": "!mcr applyDamage\n!mcr moraleCheckRoll ?{Roll||Advantage|Disadvantage}",
        "⚔️-Calculate-Forces": "!mcr calculateForces",
        "⚔️-Check-All-Done": "!mcr checkAllDone ?{Mark||mark}",
        "⚔️-Clear-Diff-Terrain": "!mcr clearDifficultTerrain",
        "⚔️-Clear-Disadvtge": "!mcr clearDisadvantage",
        "⚔️-Display-Stats": "!mcr displayStats",
        "⚔️-Do-Morale-Check": "!mcr moraleCheckRoll ?{Roll||Advantage|Disadvantage}",
        "⚔️-Do-Rally-Check": "!mcr rallyCheckRoll",
        "⚔️-Regenerate-Macros": "!mcr regenerateMacros ?{No Token Actions||true}",
        "⚔️-Remove-Damage": "!mcr removeDamage",
        "⚔️-Roll-Strength": "!mcr rollStrength",
        "⚔️-Roll-Strength-ABS": "!mcr rollStrength ABS",
        "⚔️-Roll-To-Hit": "!mcr rollToHit",
        "⚔️-Roll-To-Hit-AD": "!mcr rollToHit ?{Roll||Advantage|Disadvantage}",
        "⚔️-Set-Battle-Group": "!token-mod --set statusmarkers|!?{Colour||red|green|blue|yellow|purple|pink|brown}",
        "⚔️-Set-Diff-Terrain": "!mcr setDifficultTerrain",
        "⚔️-Set-Disadvtge": "!mcr setDisadvantage",
        "⚔️-Show-Macros-To-Players": "!mcr showMacrosToPlayers ?{True||false}",
        "⚔️-Turn-Complete": "!mcr turnComplete",
        "⚔️-Turn-Reset": "!token-mod --set aura1_radius|",
        "⚔️-Update-Unit-Data": "!mcr updateUnitData ?{Rescan||rescan}",
        "⚔️-Whisper": "!mcr whisper ?{State|on|off}",
    }
    
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
            text = "MassCombatRules: " + text;
        }

        // Log with timestamp as we are doing asynchronous stuff
        var time = new Date();
        var timeStr =
            ("0" + time.getHours()).slice(-2)   + ":" +
            ("0" + time.getMinutes()).slice(-2) + ":" +
            ("0" + time.getSeconds()).slice(-2);

        log(timeStr + ": " + indent + text);

        if(chat) {
            sendChat("MassCombatRules", "/w " + whoAMI + " " + text);
        }
    }

    /*
     * Generic to-integer function
     */
    const toInt = (value) => {
        return (value && !isNaN(value)) ? parseInt(value) : 0;
    };

    /*
     * Get page id
     */
    const getPageId = (msg) => {

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

        return Campaign().get('playerpageid');
    }

    /*
     * Check if a graphic is a token
     */
    const isToken = (token) => {
        return token && token.get("_subtype") === "token";
    }

    /*
     * Ensure that we have a number in our strength value
     */
    const checkStrength = (token, strength) => {

        clog("- checkStrength: " + strength);
        const err = isNaN(strength)
        if(err) {
            sendChat("MCR", whisper + "<h4 style=\"color:red\">ERROR: Token: " + token.get("name") + " has an invalid STR value: " + strength + "</h4>");
        }

        return err;
    }

    /*
     * Get the unit data handout to retrieve unit metadata
     */
    const getUnitDataHandout = () => {

        // Get the handout text we need
        var unitDataHandout = findObjs({
          _type: "handout",
          name: "MassCombatJSON"
        })[0];

        if(!unitDataHandout) {
            clog("- Unable to find handout");
            return;
        }
        
        return unitDataHandout;
    }
    
    /*
     *
     */
    const iterateUnitInstances = (msg, args, callbackData, unitInstanceFn, finaliserFn) => {
    
        // Get the handout text we need
        var unitDataHandout = getUnitDataHandout();
        
        if(!unitDataHandout) {
            return;
        }

        // Get contents and convert to object
        unitDataHandout.get("notes", function(notes) {

            // Need to remove HTML tags
            notes = notes.replace(/<[^>]*>?/gm, '');

            const unitsObj = JSON.parse(notes);

            // Iterate over unit arrays, find template tokens and poke in values
            clog("- Getting page id");
            let token;
            let pageId = getPageId(msg);
            
            if(!pageId) {
                clog("- Unable to find pageId from anywhere!");
                return;
            }
            
            const tokenInstances = unitInstanceFn ? findObjs({
                _type: "graphic",
                _subtype: "token",
                _pageid: pageId,
            }) : [];
            
            for(let i=0; i<unitsObj.length; i++) {

                let unitName = unitsObj[i][0];
                // Matching is a problem as if we have a unit which is 'Goblin 1' and then 'Goblin Archer 1'
                // how do we match correctly? Use a regex!
                const regex = new RegExp(`${unitName} \\d`);
                const unitInstances = tokenInstances.filter((tokenInstance) => tokenInstance.get("name").match(regex));

                //clog("- Unit: " + unitName + ": " + unitInstances.length + " units found");

                _.each(unitInstances, (unitInstance) => {
                    unitInstanceFn(unitInstance, callbackData);
                });
            }

            if(finaliserFn) {
                finaliserFn(callbackData);
            }
        });
    
    }

    /*
     * Read unit data JSON from handout and update master tokens and optionally unit instances
     */
    functionTable.updateUnitData = (msg, args) => {

        // Get the handout text we need
        var unitDataHandout = getUnitDataHandout();
        
        if(!unitDataHandout) {
            return;
        }

        // Get contents and convert to object
        unitDataHandout.get("notes", function(notes) {

            // Need to remove HTML tags
            notes = notes.replace(/<[^>]*>?/gm, '');

            const unitsObj = JSON.parse(notes);

            // Iterate over unit arrays, find template tokens and poke in values
            clog("- Getting page id");
            let token;
            let pageId = getPageId(msg);

            if(!pageId) {
                clog("- Unable to find pageId from anywhere!");
                return;
            }

            // If rescan, get all tokens
            const rescan = args[2] === "rescan";
            if(rescan) {
                clog("- Rescanning all token instances");
            }
            
            const tokenInstances = rescan ? findObjs({
                _type: "graphic",
                _subtype: "token",
                _pageid: pageId,
            }) : [];

            clog("- Iterating over metadata");
            for(let i=0; i<unitsObj.length; i++) {

                let name = unitsObj[i][0];
                clog("- Processing: " + name);
                const str = unitsObj[i][1];
                const move = unitsObj[i][2];
                const damage = unitsObj[i][3];
                const morale = unitsObj[i][4];

                const text1 = unitsObj[i][5] || "";
                const text2 = unitsObj[i][6] || "";
                const text3 = unitsObj[i][7] || "";
                const text4 = unitsObj[i][8] || "";

                const toHit = unitsObj[i][9];
                const def = unitsObj[i][10];
                const controlledBy = unitsObj[i][11];
                const prefix = unitsObj[i][12]

                // Find our token, but qualify with pageId!
                token = findObjs({
                    _type: "graphic",
                    _subtype: "token",
                    _pageid: pageId,
                    name: name
                })[0];

                if(!token) {
                    // May already be qualified with %%NUMBERED%%
                    token = findObjs({
                        _type: "graphic",
                        _subtype: "token",
                        _pageid: pageId,
                        name: name + " %%NUMBERED%%"
                    })[0];

                    if(!token) {
                        clog("- Unable to find template token with name: " + name);
                        return;
                    }
                }
                else {
                    // We have found 'bare metal' token, need to adjust name
                    token.set("name", name + " %%NUMBERED%%");
                }

                // (Re-apply) data to template token
                let info = "<div style=\"border: black 1px solid;padding: 5px;\"><p><b>" + name + "</b><br><br>";
                info += "<p><b>Stats:</b><br>Move: " + move + "<br>Damage: " + damage + "<br>Morale: " + morale + "</p><br>";
                info += "<p><b>Features:</b><br>" + text1 + "<br>" + text2 + "<br>" + text3 + "<br>" + text4 + "</p><br>";
                info += "<p><b>ATK/DEF:</b> +" + toHit + "/" + def + "</p></div>";
                token.set("gmnotes", info);

                // We have our token now need to set:
                // Morale into bar1 max
                // STR into Bar 2 current
                // to hit into bar3 max
                // Prefix into the tooltip
                token.set({"bar1_max": morale, "bar2_value": str, "bar3_max": toHit, "tooltip": prefix});

                // Get or create a character with that info
                 let character = findObjs({
                    _type: "character",
                    name: name
                })[0];

                if(!character) {
                    character = createObj("character", {
                        name: name,
                        avatar: token.get("imgsrc")
                    });
                }
                character.set("controlledby", controlledBy);
                token.set("represents", character.id);
                setDefaultTokenForCharacter(character, token);
                
                if(rescan) {
                    // Rescan: apply this data to existing instances
                    const rescanSelected = msg.selected && msg.selected.length > 0;
                    let selectedIds = [];
                    if(rescanSelected) {
                        clog("- Rescanning selected ONLY");
                        // Grab our ids into an array
                        selectedIds = msg.selected.map(s=>s._id);
                    }
                    
                    const regex = new RegExp(`${name} \\d`);
                    const unitInstances = tokenInstances.filter((tokenInstance) => tokenInstance.get("name").match(regex));
                    clog("- Unit: " + name + ": " + unitInstances.length + " units found");
                    
                    _.each(unitInstances, (unitInstance) => {
                    
                        if(rescanSelected && !selectedIds.includes(unitInstance.id)) {
                            // Do nothing
                        }
                        else {
                            // As per the default token set updated values in the token instance to match, note that we
                            // will overwrite STR which will require re-rolling so running a rescan ONLY works pre-battle
                            unitInstance.set({"gmnotes": info,
                                              "bar1_max": morale,
                                              "bar2_value": str,
                                              "bar2_max": "",
                                              "bar3_max": toHit,
                                              "tooltip": prefix});
                            
                            // Clear the aura for numeric-only units as we may be doing multiple-passes
                            if(toInt(str) !== 0) {
                                unitInstance.set({"bar2_max": str, "aura1_color": "", "aura1_radius": ""});
                            }
                        }
                    });
                }
            }
        });
    }

    /*
     * Calculate the total strength of each set of forces based on prefix which lives in the unit token's tooltip
     */
    functionTable.calculateForces999 = (msg, args) => {

        let results = {};
        iterateUnitInstances(msg, args, results, function(unitInstance, results) {

            let prefix = unitInstance.get("tooltip");
            if(!results[prefix]) {
                results[prefix] = 0;
            }

            // Check for any units without rolled strength
            if(isNaN(unitInstance.get("bar2_value"))) {
                clog("- Warning: Unit: " + unitInstance.get("name") + " has non-number STR: " + unitInstance.get("bar2_value"));
                unitInstance.set({"aura1_color": "#FF0000", "aura1_radius": 0.03});
            }
            results[prefix] += toInt(unitInstance.get("bar2_value"));
        }, function(results) {

            _.each(Object.keys(results), (key) => {
                clog("- " + key + ": " + results[key]);
            });
        });
    }
    /*
    functionTable.calculateForces = (msg, args) => {

        let pageId = getPageId(msg);
        
        if(!pageId) {
            clog("- Unable to find pageId from anywhere!");
            return;
        }

        var unitDataHandout = getUnitDataHandout();
                
        if(!unitDataHandout) {
            return;
        }

        // Get contents and convert to object
        unitDataHandout.get("notes", function(notes) {
        
            const unitsObj = JSON.parse(notes.replace(/<[^>]*>?/gm, ''));
            
            const tokenInstances = findObjs({
                _type: "graphic",
                _subtype: "token",
                _pageid: pageId,
            });

            let results = {};
            for(let i=0; i<unitsObj.length; i++) {

                let unitName = unitsObj[i][0];

                // Matching is a problem as if we have a unit which is 'Goblin 1' and then 'Goblin Archer 1'
                // how do we match correctly? Use a regex!
                const regex = new RegExp(`${unitName} \\d`);
                const unitInstances = tokenInstances.filter((tokenInstance) => tokenInstance.get("name").match(regex));

                clog("- Unit: " + unitName + ": " + unitInstances.length + " units found");

                _.each(unitInstances, (unitInstance) => {
                   
                    let prefix = unitInstance.get("tooltip");
                    if(!results[prefix]) {
                        results[prefix] = 0;
                    }
                    
                    // Check for any units without rolled strength
                    if(isNaN(unitInstance.get("bar2_value"))) {
                        clog("- Warning: Unit: " + unitInstance.get("name") + " has non-number STR: " + unitInstance.get("bar2_value"));
                        unitInstance.set({"aura1_color": "#FF0000", "aura1_radius": 0.03});
                    }
                    results[prefix] += toInt(unitInstance.get("bar2_value"));
                });
            }

            _.each(Object.keys(results), (key) => {
                clog("- " + key + ": " + results[key]);
            });
        });
    }
    */
    
    /*
     * Check all units have acted
     */
    functionTable.checkAllDone = (msg, args) => {
     
        let pageId = getPageId(msg);
        const scale = getObj("page", pageId).get("scale_number");
                
        if(!pageId) {
            clog("- Unable to find pageId from anywhere!");
            return;
        }

        var unitDataHandout = getUnitDataHandout();
                
        if(!unitDataHandout) {
            return;
        }

        // Get contents and convert to object
        unitDataHandout.get("notes", function(notes) {
        
            const unitsObj = JSON.parse(notes.replace(/<[^>]*>?/gm, ''));
            
            const tokenInstances = findObjs({
                _type: "graphic",
                _subtype: "token",
                _pageid: pageId,
            });

            let results = {};
            
            for(let i=0; i<unitsObj.length; i++) {

                let unitName = unitsObj[i][0];

                // Matching is a problem as if we have a unit which is 'Goblin 1' and then 'Goblin Archer 1'
                // how do we match correctly? Use a regex!
                const regex = new RegExp(`${unitName} \\d`);
                const unitInstances = tokenInstances.filter((tokenInstance) => tokenInstance.get("name").match(regex));

                //clog("- Unit: " + unitName + ": " + unitInstances.length + " units found");

                _.each(unitInstances, (unitInstance) => {
                    
                    // Check for any units without turn complete
                    const aura1Radius = unitInstance.get("aura1_radius");
                    clog("- aura1Radius: " + aura1Radius);
                    if(aura1Radius === undefined || aura1Radius === "") {
                        clog("- Unit: " + unitInstance.get("name") + " is NOT turn complete");
                        
                        if(args[2] === "mark") {
                            // Set aura 2
                            unitInstance.set({"aura2_color": "#FF0000", "aura2_radius": scale/5, "aura2_square": true});
                        }
                        else {
                            // Clear aura 2
                            unitInstance.set({"aura2_color": "", "aura2_radius": "", "aura2_square": false});
                        }
                    }
                });
            }  
        });      
    }

    /*
     * Show or hide the unit tokens nameplates
     */
    functionTable.showNames = (msg, args) => {

        let pageId = getPageId(msg);

        if(!pageId) {
            clog("- Unable to find pageId from anywhere!");
            return;
        }

        var unitDataHandout = getUnitDataHandout();

        if(!unitDataHandout) {
            return;
        }

        // Get contents and convert to object
        unitDataHandout.get("notes", function(notes) {

            const unitsObj = JSON.parse(notes.replace(/<[^>]*>?/gm, ''));

            const tokenInstances = findObjs({
                _type: "graphic",
                _subtype: "token",
                _pageid: pageId,
            });

            if(args[2] === undefined || !["true", "false"].includes(args[2])) {
                clog("- Requires true|false argument");
                return
            }
            
            const showNames = args[2] === "true" ? true : false

            for(let i=0; i<unitsObj.length; i++) {

                let unitName = unitsObj[i][0];

                // Matching is a problem as if we have a unit which is 'Goblin 1' and then 'Goblin Archer 1'
                // how do we match correctly? Use a regex!
                const regex = new RegExp(`${unitName} \\d`);
                const unitInstances = tokenInstances.filter((tokenInstance) => tokenInstance.get("name").match(regex));

                clog("- Unit: " + unitName + ": " + unitInstances.length + " units found");

                _.each(unitInstances, (unitInstance) => {
                
                    if(args[3]) {
                        if(unitInstance.get("tooltip") === args[3]) {
                            unitInstance.set("showplayers_name", showNames);
                        }
                    }
                    else {
                        unitInstance.set("showplayers_name", showNames);
                    }
                });
            }
        });
    }

    /*
     * Display the statistics for selected tokens, takes a second arg of unit side which will whisper those
     * unit stats, so GM can display stats without players seeing
     */
     functionTable.displayStats = (msg, args) => {

        // We only want to do this once per unit type so some mangling required
        let processedUnits = [];
        _.each(msg.selected, (selected) => {

            let selectedObj = getObj("graphic", selected._id);
            const name = selectedObj.get("name");

            let character = getObj("character", selectedObj.get("represents"))
            if(!character) {
                clog("- Unable to find character for: " + name);
                return;
            }
            const represents = character.get("name");
            if(!processedUnits.includes(represents)) {
                processedUnits.push(represents);

                let thisWhisper = whisper;
                if(args[2] === selectedObj.get("tooltip")) {
                    // Actual whisper
                    clog("- Whispering stats to GM");
                    thisWhisper = "/w GM ";
                }
                const imgStr = "<br><img style=\"width:140px;height:140px;margin-left: auto; margin-right: auto; display: block\" src=\"" + selectedObj.get("imgsrc") + "\">";
                // If any manual edits take place like beefing up individual units the HTML gets escaped, so we unescape it
                // TODO: unescape is deprecated, should this be done a different way?
                sendChat("MCR", thisWhisper + imgStr + unescape(selectedObj.get("gmnotes")));
            }
        });
    }

    /*
     * Remove and regenerate the macros
     */
    functionTable.regenerateMacros = (msg, args) => {
    
        // Delete and re-create our MCR macros
        const macroNames = Object.keys(macroDef);
    
        // Get all macros and remove our ones
        const macros = findObjs({_type: "macro"});
        for(let i=macros.length-1; i>=0; i--) {  
            // Delete our known macros
            if(macroNames.includes(macros[i].get("name"))) {
                macros[i].remove();
            }
        }

        for(key in macroDef) {
            // Re-create macro
            const isTokenAction = (!notTokenActions.includes(key)) && (args[2] !== "true");

            createObj("macro", {
                _playerid: msg.playerid,
                name: key,
                action: macroDef[key],
                istokenaction: isTokenAction
            });
        }
    }

    /*
     * Show macros to players by setting permissions
     */
    functionTable.showMacrosToPlayers = (msg, args) => {

        const macroNames = Object.keys(macroDef);
        const show = !(args[2] && args[2].toLowerCase() === "false");
        const val = show ? "all" : "";
    
        const macros = findObjs({_type: "macro"});
        for(let i=macros.length-1; i>=0; i--) {  
            // Show macros from our list
            const macroName = macros[i].get("name");
            if(macroNames.includes(macroName) && !notTokenActions.includes(macroName)) {
                macros[i].set("visibleto", val);
            }
        }
    }

    /*
     *
     */
    functionTable.rollStrength = (msg, args) => {

        let alreadyDones = 0;
        _.each(msg.selected, function(selected) {

            let token = getObj("graphic", selected._id);
            if(!isToken(token)) {
                clog("- Not token");
                return;
            }
            
            // We have our token, we now need to get the value of bar 2
            let strength = token.get("bar2_value");
            let maxStrength = token.get("bar2_max");
            if(!isNaN(strength)) {
                // We are already a number
                alreadyDones++;
                // Set our max strength if not already there
                if(!maxStrength) {
                    token.set("bar2_max", strength);
                }
            }
            else {
                let rollType = "r<1]]";
                // Make a special case for 1D2 to use ABS, otherwise any 1D2 unit will just end up with 2!
                if(args[2] == "ABS" || strength.toUpperCase() === "1D2") {
                    rollType = "]]"
                }
                // Roll strength as an inline roll
                let roll = "[[" + strength + rollType;
                sendChat("MCR", "!mcr setStrength " + selected._id + " " + roll);
            }
        });

        if(msg.selected) {
            sendChat("MCR", whisper + "Unit strength set for " + msg.selected.length + " token(s) (Already dones: " + alreadyDones + ")");
        }
    }

    /*
     *
     */
    functionTable.setStrength = (msg, args) => {

        if(_.has(msg,"inlinerolls")) {
            let currentStrength = msg.inlinerolls[0].results.total
            let token = getObj("graphic", args[2]);
            if(!isToken(token)) {
                return;
            }
            token.set({"bar2_value": currentStrength, "bar2_max": currentStrength, "aura1_color": "", "aura1_radius": ""});
        }
    }

    /*
     *
     */
    functionTable.moraleCheckRoll = (msg, args) => {
        _.each(msg.selected, function(selected) {

            let token = getObj("graphic", selected._id);
            if (!isToken(token)) {
                return;
            }

            if(token.get("bar2_value") === 0) {
                // Probably just died, return
                return;
            }

            let diceRoll = " [[1D20]]";
            if(args[2] === "Advantage") {
                diceRoll = " [[2d20kh1]]";
            }
            else if(args[2] === "Disadvantage") {
                diceRoll = " [[2d20kl1]]";
            }

            sendChat("MCR", "!mcr moraleCheck " + selected._id + diceRoll);
        });
    }

    /*
     *
     */
    functionTable.moraleCheck = (msg, args) => {

        if(_.has(msg,"inlinerolls")) {

            let roll = msg.inlinerolls[0].results.total
            let token = getObj("graphic", args[2]);
            if(!isToken(token)) {
                return;
            }
            
            let strength = token.get("bar2_value");
            
            if(checkStrength(token, strength)) {
                return;
            }
            
            let morale = parseInt(token.get("bar1_max"));
            let check = 15 - morale - strength;
            let name = token.get("name");

            if(isNaN(strength)) {
                sendChat("MCR", whisper + "<h4 style=\"color:red\">ERROR: Token: " + token.get("name") + "has an invalid STR value: " + strength + "</h4>");
                return;
            }
            if(isNaN(morale)) {
                sendChat("MCR", whisper + "<h4 style=\"color:red\">ERROR: Token: " + token.get("name") + "has an invalid Morale value: " + morale + "</h4>");
                return;
            }

            if(roll <= 3) {
                // Routed
                token.set("status_broken-heart", true);
                //token.set("status_screaming", true);
                sendChat(name, whisper + "<h4 style=\"color:red\">MORALE [" + roll + ">=" + check + "]: " + " We have been ROUTED! We must flee 1 hex! We have disadvantage on our next attack!</h4>");
                if (moraleRouted) {
                    moraleRouted.set({"playing": true, "softstop": false});
                }
            }
            else if(roll < check) {
                // Failed
                token.set("status_broken-heart", true);
                //token.set("status_screaming", false);
                sendChat(name, whisper + "<h4 style=\"color:orange\">MORALE [" + roll + ">=" + check + "]: " + " We are DEMORALISED! We have disadvantage on our next attack!</h4>");
                if (moraleFailed) {
                    moraleFailed.set({"playing": true, "softstop": false});
                }
            }
            else {
                token.set("status_broken-heart", false);
                //token.set("status_screaming", false);
                sendChat(name, whisper + "<h4 style=\"color:blue\">MORALE [" + roll + ">=" + check + "]: " + " We are RESOLUTE!</h4>");
                if (moraleSuccess) {
                    moraleSuccess.set({"playing": true, "softstop": false});
                }
            }
        }
    }

    /*
     * Switch chat whisper on and off, useful for testing without clogging chat
     */
    functionTable.whisper = (msg, args) => {

        whisper = args[2] === "off" ? "" : "/w GM ";
    }

    /*
     * Apply damage and if unit is dead mark it as such and send it to back of z-order
     */
    functionTable.applyDamage = (msg, args) => {

        _.each(msg.selected, function(selected) {

            let token = getObj("graphic", selected._id);
            if (!isToken(token)) {
                return;
            }

            let strength = token.get("bar2_value");

            if(checkStrength(token, strength)) {
                return;
            }

            if(strength > 0) {
                strength--;
            }
            token.set("bar2_value", strength);

            if(strength === 0) {
                token.set("status_dead", true);
                // Send token to back so we can walk over their corpses!
                toBack(token);
            }
        });
    }

    /*
     * Remove damage, e.g. for healing, or a mistake!
     */
    functionTable.removeDamage = (msg, args) => {
        _.each(msg.selected, function(selected) {

            let token = getObj("graphic", selected._id);
            if (!isToken(token)) {
                return;
            }

            let strength = token.get("bar2_value");

            if(checkStrength(token, strength)) {
                return;
            }

            strength++;
            token.set({"bar2_value": strength, "status_dead": false});
            toFront(token);
        });
    }

    /*
     * Roll to hit
     */
    functionTable.rollToHit = (msg, args) => {

        _.each(msg.selected, function(selected) {

            let token = getObj("graphic", selected._id);
            if (!isToken(token)) {
                return;
            }

            let toHit = token.get("bar3_max");

            let diceRoll = " 1D20";
            if(args[2] === "Advantage") {
                diceRoll = " 2d20kh1";
            }
            else if(args[2] === "Disadvantage") {
                diceRoll = " 2d20kl1";
            }
            diceRoll += "+" + toHit;

            const rollType = whisper === "" ? "/r " : "/gmroll ";
            
            // Clear morale status
            token.set("status_broken-heart", false);

            sendChat(token.get("name"), rollType + diceRoll);
        });
    }

    /*
     * Set difficult terrain marker
     */
    functionTable.setDifficultTerrain = (msg, args) => {

        _.each(msg.selected, function(selected) {

            let token = getObj("graphic", selected._id);
            if (!isToken(token)) {
                return;
            }

            token.set("status_snail", true);
        });
    }

    /*
     * Clear difficult terrain marker
     */
    functionTable.clearDifficultTerrain = (msg, args) => {

        _.each(msg.selected, function(selected) {

            let token = getObj("graphic", selected._id);
            if (!isToken(token)) {
                return;
            }

            token.set("status_snail", false);
        });
    }

    /*
     * Set disadvantage
     */
    functionTable.setDisadvantage = (msg, args) => {

        _.each(msg.selected, function(selected) {

            let token = getObj("graphic", selected._id);
            if (!isToken(token)) {
                return;
            }

            token.set("status_broken-heart", true);
        });
    }

    /*
     * Clear disadvantage
     */
    functionTable.clearDisadvantage = (msg, args) => {

        _.each(msg.selected, function(selected) {

            let token = getObj("graphic", selected._id);
            if (!isToken(token)) {
                return;
            }

            token.set("status_broken-heart", false);
        });
    }

    /*
     * Do rally check roll
     */
    functionTable.rallyCheckRoll = (msg, args) => {

        _.each(msg.selected, function(selected) {

            let token = getObj("graphic", selected._id);
            if (!isToken(token)) {
                return;
            }

            sendChat("MCR", "!mcr rallyCheck " + selected._id + " [[1D20]]");
        });
    }

    /*
     * Do rally check based on roll result
     */
    functionTable.rallyCheck = (msg, args) => {

        if(_.has(msg,"inlinerolls")) {

            let roll = msg.inlinerolls[0].results.total
            let token = getObj("graphic", args[2]);
            let morale = parseInt(token.get("bar1_max"));
            
            let strength = token.get("bar2_value");

            if(checkStrength(token, strength)) {
                return;
            }
                        
            let check = 20 - morale - strength;
            let name = token.get("name");

            if(isNaN(strength)) {
                sendChat("MCR", whisper + "<h4 style=\"color:red\">ERROR: Token: " + token.get("name") + "has an invalid STR value: " + strength + "</h4>");
                return;
            }
            if(isNaN(morale)) {
                sendChat("MCR", whisper + "<h4 style=\"color:red\">ERROR: Token: " + token.get("name") + "has an invalid Morale value: " + morale + "</h4>");
                return;
            }

            if(roll < check) {
                // Failed
                sendChat(name, whisper + "<h4 style=\"color:red\">RALLY [" + roll + "<=" + check + "]: " + " We have FAILED our allies!</h4>");
            }
            else {
                sendChat(name, whisper + "<h4 style=\"color:blue\">MORALE [" + roll + ">=" + check + "]: " + " We have RALLIED our allies!</h4>");
            }
        }
    }

    /*
     * Mark units as turn complete by showing an aura
     */
    functionTable.turnComplete = (msg, args) => {

        _.each(msg.selected, function(selected) {

            let token = getObj("graphic", selected._id);
            if (!isToken(token)) {
                return;
            }

            // Need to scale the aura by the page scale
            const pageId = getPageId(msg);
            const scale = getObj("page", pageId).get("scale_number");

            // Set the aura
            token.set("aura1_color", "#0000ff");
            token.set("aura1_radius", scale/10);
        });
    }

    /*
     * Reset the audio tracks
     */
    functionTable.resetAudioTracks = () => {

        moraleSuccess = findObjs({type: "jukeboxtrack", title: "MoraleSuccess"})[0];
        moraleFailed = findObjs({type: "jukeboxtrack", title: "MoraleFail"})[0];
        moraleRouted = findObjs({type: "jukeboxtrack", title: "MoraleRouted"})[0];
    }

    /*
     * Chat message handler
     */
    chatMessage = (msg) => {

        let args = msg.content.split(/\s+/);
        if(args[0] === "!mcr") {
            // Lookup and call our function
            if(functionTable[args[1]]) {
                clog("Running command: " + args.join(" "));
                functionTable[args[1]](msg, args);
            }
            else {
                clog("Unknown command: " + args[1]);
            }
        }
    };

    /*
     * Event handling callbacks
     */
    const registerEventHandlers = () => {
        on('chat:message', chatMessage);
        functionTable.resetAudioTracks();
        clog("Ready");
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
on('ready', MassCombatRules.RegisterEventHandlers);