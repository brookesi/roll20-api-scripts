const MassCombatRules = (() => {

    // TODO Add a state object and allow some DC constants to be adjusted, e.g. rally, morale etc.

    // Global variables    
    let currentStrength = 0;
    let whisper = "/w GM ";
    const notTokenActions = [
        "⚔️-Roll-Strength-ABS",
        "⚔️-Read-Unit-Data",
        "⚔️-Whisper",
        "⚔️-Regenerate-Macros",
        "⚔️-Read-Unit-Data"
    ];

    // Function lookup table
    let functionTable = {}

    /*
     *
     */
    const macroDef = {
        "⚔️-Apply-Damage": "!mcr incrementDamage",
        "⚔️-Apply-Damage-And-Morale": "!mcr incrementDamage\n!mcr moraleCheck",
        "⚔️-Clear-Difficult-Terrain": "!mcr clearDifficultTerrain",
        "⚔️-Clear-Disadvantage": "!mcr clearDisadvantage",
        "⚔️-Clear-Morale-Status": "!mcr clearMoraleStatus",
        "⚔️-Do-Morale-Check": "!mcr moraleCheck",
        "⚔️-Do-Rally-Check": "!mcr rallyCheck",
        "⚔️-Remove-Damage": "!mcr decrementDamage",
        "⚔️-Roll-Strength": "!mcr generateSelectedRollStrength",
        "⚔️-Roll-Strength-ABS": "!mcr generateSelectedRollStrength ABS",
        "⚔️-Roll-To-Hit": "** @{selected|token_name} rolled: **\n/r 1D20@{selected|bar3|max}",
        "⚔️-Set-Battle-Group": "!token-mod --set statusmarkers|=blue|-blue\n!token-mod --set statusmarkers|=?{Colour||red|green|blue|yellow|purple|pink|brown}",
        "⚔️-Set-Difficult-Terrain": "!mcr setDifficultTerrain",
        "⚔️-Set-Disadvantage": "!mcr setDisadvantage",
        "⚔️-Turn-Complete": "!token-mod --set aura1_color|0000ff aura1_radius|0.01",
        "⚔️-Turn-Reset": "!token-mod --set aura1_radius|",
        "⚔️-Display-Stats": "!mcr displayStats",
        "⚔️-Whisper": "!mcr whisper ?{State|on|off}",
        "⚔️-Regenerate-Macros": "!mcr regenerateMacros ?{No Token Actions||true}",
        "⚔️-Read-Unit-Data": "!mcr readUnitData ?{Rescan||rescan}",
        "⚔️-Show-Macros-To-Players": "!mcr showMacrosToPlayers ?{True||false}"
    }
            
    // Utility functions
    const notToken = (token) => {
        return token && token.get("_subtype") !== "token";
    }

    /*
     *
     */
    const getPageId = (msg) => {

        let pageId;
        _.each(msg.selected, (selected) => {

            let selectedObj = getObj("graphic", selected._id);
            if(!pageId) {
                pageId = selectedObj.get("_pageid");
            }
        });

        if(!pageId) {
            // Nothing selected, try from player
            const player = findObjs({
               _type: "player",
               _id: msg.playerid
            })[0];

            if(player) {
                pageId = player.get("_lastpage");
            }
            else {
                // Something badly wrong!
                log("Unable to find player!");
                return undefined;
            }
        }

        return pageId
    }

    /*
     *
     */
    functionTable.dumpDefToken = (msg, args) => {

        let character = findObjs({
            _type: "character",
            name: "Mercenary"
        })[0];

        character.get("_defaulttoken", function(deftok) {
            log(deftok);
        });
    }

    /*
     *
     */
    functionTable.readUnitData = (msg, args) => {

        // Get the handout text we need
        var unitDataHandout = findObjs({
          _type: "handout",
          name: "MassCombatJSON"
        })[0];

        if(!unitDataHandout) {
            log("Unable to find handout");
            return;
        }

        // Get contents and convert to object
        unitDataHandout.get("notes", function(notes) {

            //log(notes);
            // Need to remove HTML tags
            notes = notes.replace("<p>", "").replace("<br>", "").replace("</p>", "");

            const unitsObj = JSON.parse(notes);

            //log(unitsObj[0]);

            // Iterate over unit arrays, find template tokens and poke in values
            let token;
            let pageId = getPageId(msg);

            if(!pageId) {
                log("- Unable to find pageId from anywhere!");
                return;
            }

            for(let i=0; i<unitsObj.length; i++) {

                let name = unitsObj[i][0];
                const str = unitsObj[i][1];
                const move = unitsObj[i][2];
                const damage = unitsObj[i][3];
                const morale = unitsObj[i][4];

                const toHit = unitsObj[i][9];
                const def = unitsObj[i][10];
                const controlledBy = unitsObj[i][11];

                const text1 = unitsObj[i][5] || "";
                const text2 = unitsObj[i][6] || "";
                const text3 = unitsObj[i][7] || "";
                const text4 = unitsObj[i][8] || "";

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
                        name: name + " %%NUMBERED%%"
                    })[0];

                    if(!token) {
                        log("Unable to find token with name: " + name);
                        return;
                    }
                }
                else {
                    // We have found 'bare metal' token, need to adjust name
                    token.set("name", name + " %%NUMBERED%%");
                }

                // (Re-apply) data to token
                let info = "<div style=\"border: black 1px solid;padding: 5px;\"><p><b>" + name + "</b><br><br>";
                info += "<p><b>Stats:</b><br>Move: " + move + "<br>Damage: " + damage + "<br>Morale:" + morale + "</p><br>";
                info += "<p><b>Features:</b><br>" + text1 + "<br>" + text2 + "<br>" + text3 + "<br>" + text4 + "</p><br>";
                info += "<p><b>ATK/DEF:</b> +" + toHit + "/" + def + "</p></div>";
                token.set("gmnotes", info);

                // We have our token now need to set:
                // Morale into bar1 max
                // STR into Bar 2 current
                // to hit into bar3 max
                token.set("bar1_max", morale);
                token.set("bar2_value", str);
                token.set("bar3_max", toHit);

                //log("TOKEN: " + JSON.stringify(token));

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
            }

            if(args[2] === "rescan") {

                const tokenInstances = findObjs({
                    _type: "graphic",
                    _subtype: "token",
                    _pageid: pageId,
                });

                for(let i=0; i<unitsObj.length; i++) {
                    // There may be existing instances of tokens we need to update and force new values from the
                    // unit data into. Finding them will be a bit brute force and inefficient but hey ho!
                    let unitName = unitsObj[i][0];

                    // Matching is a problem as if we have a unit which is 'Goblin 1' and then 'Goblin Archer 1'
                    // how do we match correctly?
                    const regex = new RegExp(`${unitName} \\d`);
                    const unitInstances = tokenInstances.filter((tokenInstance) => tokenInstance.get("name").match(regex));

                    log("Unit: " + unitName + ": " + unitInstances.length + " units found");

                    _.each(unitInstances, (unitInstance) => {
                        // As per the default token set updated values in the token instance to match, note that we
                        // will overwrite STR which will require re-rolling so running a rescan ONLY works pre-battle
                        const str = unitsObj[i][1];
                        const morale = unitsObj[i][4];
                        const toHit = unitsObj[i][9];

                        unitInstance.set("bar1_max", morale);
                        unitInstance.set("bar2_value", str);
                        unitInstance.set("bar2_max", ""); // Clear STR
                        unitInstance.set("bar3_max", toHit);
                    });
                }
            }
        });
    }

    /*
     *
     */
     functionTable.displayStats = (msg, args) => {

        _.each(msg.selected, (selected) => {

            let selectedObj = getObj("graphic", selected._id);
            sendChat("MCR", whisper + selectedObj.get("gmnotes"));
        });
    }

    /*
     *
     */
    functionTable.regenerateMacros = (msg, args) => {
    
        // Delete and re-create our MCR macros
        const macroNames = Object.keys(macroDef);
    
        // Get all macros and remove our ones
        const macros = findObjs({_type: "macro"});
        for(let i=macros.length-1; i>=0; i--) {  
            // Delete macros starting "⚔️-"
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
     *
     */
    /*
    functionTable.writeCommandButtons = () => {

        const macroNames = Object.keys(macroDef);

        // Write out command buttons
        let html = "<table>"
        _.each(macroNames, (macroName) => {
            const prettyName = macroName.replace("MCR-", "").replaceAll("-", " ");
            html += "<tr><td>" + '<a style="background-color: darkgreen" href="!&#13;#' + macroName + '">' + prettyName + '</a>'
        });
        html += "</table>"
        sendChat("", html);
    }
    */

    /*
     *
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
    functionTable.generateSelectedRollStrength = (msg, args) => {

        let alreadyDones = 0;
        _.each(msg.selected, function(selected) {

            let token = getObj("graphic", selected._id);
            if(notToken()) {
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
                sendChat("MCR", "!mcr setRollStrength " + selected._id + " " + roll);
            }
        });

        sendChat("MCR", whisper + "Unit strength set for " + msg.selected.length + " token(s) (Already dones: " + alreadyDones + ")");
    }

    /*
     *
     */
    functionTable.setRollStrength = (msg, args) => {

        if(_.has(msg,"inlinerolls")) {
            let currentStrength = msg.inlinerolls[0].results.total
            let token = getObj("graphic", args[2]);
            if(notToken()) {
                return;
            }
            token.set("bar2_value", currentStrength);
            token.set("bar2_max", currentStrength);
        }
    }

    /*
     *
     */
    functionTable.moraleCheck = (msg, args) => {
        _.each(msg.selected, function(selected) {

            let token = getObj("graphic", selected._id);
            if (notToken(token)) {
                return;
            }

            sendChat("MCR", "!mcr moraleCheckRoll " + selected._id + " [[1D20]]");
        });
    }

    /*
     *
     */
    functionTable.moraleCheckRoll = (msg, args) => {

        if(_.has(msg,"inlinerolls")) {

            let roll = msg.inlinerolls[0].results.total
            let token = getObj("graphic", args[2]);
            if(notToken()) {
                return;
            }
            let morale = parseInt(token.get("bar1_max"));
            let strength = parseInt(token.get("bar2_value"));
            let check = 15 - morale - strength;
            let name = token.get("name");

            if(roll <= 3) {
                // Routed
                token.set("status_broken-heart", true);
                token.set("status_screaming", true);
                sendChat(name, whisper + "<h4 style=\"color:red\">MORALE [" + roll + ">=" + check + "]: " + " We have been ROUTED! We must flee 1 hex!</h4>");
                if (moraleRouted) {
                    moraleRouted.set({"playing": true, "softstop": false});
                }
            }
            else if(roll < check) {
                // Failed
                token.set("status_broken-heart", true);
                token.set("status_screaming", false);
                sendChat(name, whisper + "<h4 style=\"color:orange\">MORALE [" + roll + ">=" + check + "]: " + " We are DEMORALISED! We have disadvantage on next attack!</h4>");
                if (moraleFailed) {
                    moraleFailed.set({"playing": true, "softstop": false});
                }
            }
            else {
                token.set("status_broken-heart", false);
                token.set("status_screaming", false);
                sendChat(name, whisper + "<h4 style=\"color:blue\">MORALE [" + roll + ">=" + check + "]: " + " We are RESOLUTE!</h4>");
                if (moraleSuccess) {
                    moraleSuccess.set({"playing": true, "softstop": false});
                }
            }
        }
    }

    functionTable.whisper = (msg, args) => {
        whisper = args[2] === "off" ? "" : "/w GM ";
    }

    /*
     *
     */
    const checkStrength = (token, strength) => {

        // Ensure that we have a number in our strength value
        const err = isNaN(strength)
        if(err) {
            sendChat(name, whisper + "<h4 style=\"color:red\">ERROR: Token: " + token.get("name") + "has an invaid STR value: " + strength + "</h4>");
        }

        return err;
    }

    /*
     *
     */
    functionTable.incrementDamage = (msg, args) => {

        _.each(msg.selected, function(selected) {

            let token = getObj("graphic", selected._id);
            if (notToken(token)) {
                return;
            }

            let strength = parseInt(token.get("bar2_value"));

            if(checkStrength(token, strength)) {
                return;
            }

            if(strength > 0) {
                strength--;
            }
            token.set("bar2_value", strength);

            if(strength === 0) {
                token.set("status_dead", true);
            }
        });
    }

    /*
     *
     */
    functionTable.decrementDamage = (msg, args) => {
        _.each(msg.selected, function(selected) {

            let token = getObj("graphic", selected._id);
            if (notToken(token)) {
                return;
            }

            let strength = parseInt(token.get("bar2_value"));

            if(checkStrength(token, strength)) {
                return;
            }

            strength++;
            token.set("bar2_value", strength);
            token.set("status_dead", false);
        });
    }

    /*
     *
     */
    functionTable.clearMoraleStatus = (msg, args) => {
        _.each(msg.selected, function(selected) {

            let token = getObj("graphic", selected._id);
            if (notToken()) {
                return;
            }

            token.set("status_broken-heart", false);
            token.set("status_screaming", false);
        });
    }

    /*
     *
     */
    functionTable.setDifficultTerrain = (msg, args) => {

        _.each(msg.selected, function(selected) {

            let token = getObj("graphic", selected._id);
            if (notToken(token)) {
                return;
            }

            token.set("status_snail", true);
        });
    }

    /*
     *
     */
    functionTable.clearDifficultTerrain = (msg, args) => {

        _.each(msg.selected, function(selected) {

            let token = getObj("graphic", selected._id);
            if (notToken(token)) {
                return;
            }

            token.set("status_snail", false);
        });
    }

    /*
     *
     */
    functionTable.setDisadvantage = (msg, args) => {

        _.each(msg.selected, function(selected) {

            let token = getObj("graphic", selected._id);
            if (notToken(token)) {
                return;
            }

            token.set("status_broken-heart", true);
        });
    }

    /*
     *
     */
    functionTable.clearDisadvantage = (msg, args) => {

        _.each(msg.selected, function(selected) {

            let token = getObj("graphic", selected._id);
            if (notToken(token)) {
                return;
            }

            token.set("status_broken-heart", false);
            token.set("status_screaming", false);
        });
    }

    /*
     *
     */
    functionTable.rallyCheck = (msg, args) => {

        _.each(msg.selected, function(selected) {

            let token = getObj("graphic", selected._id);
            if (notToken(token)) {
                return;
            }

            sendChat("", "!mcr rallyCheckRoll " + selected._id + " [[1D20]]");
        });
    }

    /*
     *
     */
    functionTable.rallyCheckRoll = (msg, args) => {

        if(_.has(msg,"inlinerolls")) {

            let roll = msg.inlinerolls[0].results.total
            let token = getObj("graphic", args[2]);
            let morale = parseInt(token.get("bar1_max"));
            let strength = parseInt(token.get("bar2_value"));
            let check = 20 - morale - strength;
            let name = token.get("name");

            if(roll < check) {
                // Failed
                sendChat(name, whisper + "<h4 style=\"color:red\">RALLY [" + roll + ">=" + check + "]: " + " We have FAILED our allies!</h4>");
            }
            else {
                sendChat(name, whisper + "<h4 style=\"color:blue\">MORALE [" + roll + ">=" + check + "]: " + " We have RALLIED our allies!</h4>");
            }
        }
    }

    /*
     *
     */
    functionTable.resetAudioTracks = () => {

        moraleSuccess = findObjs({type: "jukeboxtrack", title: "MoraleSuccess"})[0];
        moraleFailed = findObjs({type: "jukeboxtrack", title: "MoraleFail"})[0];
        moraleRouted = findObjs({type: "jukeboxtrack", title: "MoraleRouted"})[0];
    }

    /*
     *
     */
    chatMessage = (msg) => {

        let args = msg.content.split(/\s+/);
        if(args[0] === "!mcr") {
            // Lookup and call our function
            if(functionTable[args[1]]) {
                log("Running command: " + args[1]);
                functionTable[args[1]](msg, args);
            }
            else {
                log("Unknown command: " + args[1]);
            }
        }
    };

    /*
     * Event handling callbacks
     */
    const registerEventHandlers = () => {
        on('chat:message', chatMessage);
        functionTable.resetAudioTracks();
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