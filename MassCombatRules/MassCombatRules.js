const MassCombatRules = (() => {

    // TODO Add a state object and allow some DC constants to be adjusted, e.g. rally, morale etc.

    // Global variables    
    let currentStrength = 0;

    // Function lookup table
    let functionTable = {}

    /*
     *
     */
    const macroDef = {
        "MCR-Apply-Damage": "!mcr incrementDamage",
        "MCR-Apply-Damage-And-Morale": "!mcr incrementDamage\n#Do_Morale_Check",
        "MCR-Clear-Difficult-Terrain": "!mcr clearDifficultTerrain",
        "MCR-Clear-Disadvantage": "!mcr clearDisadvantage",
        "MCR-Clear-Morale-Status": "!mcr clearMoraleStatus",
        "MCR-Do-Morale-Check": "!mcr moraleCheck",
        "MCR-Do-Rally-Check": "!mcr rallyCheck",
        "MCR-Remove-Damage": "!mcr decrementDamage",
        "MCR-Roll-Strength": "!mcr generateSelectedRollStrength",
        "MCR-Roll-Strength-ABS": "!mcr generateSelectedRollStrength ABS",
        "MCR-Roll-To-Hit": "** @{selected|token_name} rolled: **\n/r 1D20@{selected|bar3}",
        "MCR-Set-Battle-Group": "!token-mod --set statusmarkers|=blue|-blue\n!token-mod --set statusmarkers|=?{Modifier||red|green|blue|yellow|purple|pink|brown}",
        "MCR-Set-Difficult-Terrain": "!mcr setDifficultTerrain",
        "MCR-Set-Disadvantage": "!mcr setDisadvantage",
        "MCR-Turn-Complete": "!token-mod --set aura1_color|0000ff aura1_radius|10",
        "MCR-Turn-Reset": "!token-mod --set aura1_radius|",
    }
            
    // Utility functions
    const notToken = (token) => {
        return token && token.get("_subtype") !== "token";
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
            // Delete macros starting "MCR-"
            if(macroNames.includes(macros[i].get("name"))) {
                macros[i].remove();
            }
        }
        
        for(key in macroDef) {
            // Re-create macro
            createObj("macro", {
                _playerid: msg.playerid,
                name: key,
                action: macroDef[key],
                istokenaction: false
            });
        }
    }

    /*
     *
     */
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

    /*
     *
     */
    functionTable.showMacrosToPlayers = (msg, args) => {

        const macroNames = Object.keys(macroDef);
        const show = !(args[2] && args[2].toLowerCase() === "false");
        const val = show ? "all" : "";
    
        const macros = findObjs({_type: "macro"});
        for(let i=macros.length-1; i>=0; i--) {  
            // Delete macros starting "MCR-"
            if(macroNames.includes(macros[i].get("name"))) {
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
            let strength = token.get("bar2_value")
            if(!isNaN(strength)) {
                // We are already a number
                alreadyDones++;
            }
            else {
                let rollType = "r<1]]";
                if(args[2] == "ABS") {
                    rollType = "]]"
                }
                // Roll strength as an inline roll
                let roll = "[[" + strength + rollType;
                sendChat("", "!mcr setRollStrength " + selected._id + " " + roll);
            }
        });

       sendChat("Coryphon", "Unit strength set for " + msg.selected.length + " token(s) (Already dones: " + alreadyDones + ")");
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

            sendChat("", "!mcr moraleCheckRoll " + selected._id + " [[1D20]]");
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
                sendChat(name, "<h4 style=\"color:red\">MORALE [" + roll + ">=" + check + "]: " + " We have been ROUTED! We must flee 1 hex!</h4>");
                if (moraleRouted) {
                    moraleRouted.set({"playing": true, "softstop": false});
                }
            }
            else if(roll < check) {
                // Failed
                token.set("status_broken-heart", true);
                token.set("status_screaming", false);
                sendChat(name, "<h4 style=\"color:orange\">MORALE [" + roll + ">=" + check + "]: " + " We are DEMORALISED! We have disadvantage on next attack!</h4>");
                if (moraleFailed) {
                    moraleFailed.set({"playing": true, "softstop": false});
                }
            }
            else {
                token.set("status_broken-heart", false);
                token.set("status_screaming", false);
                sendChat(name, "<h4 style=\"color:blue\">MORALE [" + roll + ">=" + check + "]: " + " We are RESOLUTE!</h4>");
                if (moraleSuccess) {
                    moraleSuccess.set({"playing": true, "softstop": false});
                }
            }
        }
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
            if(strength > 0) {
                strength--;
            }
            token.set("bar2_value", strength);

            if(strength == 0) {
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
                sendChat(name, "<h4 style=\"color:red\">RALLY [" + roll + ">=" + check + "]: " + " We have FAILED our allies!</h4>");
            }
            else {
                sendChat(name, "<h4 style=\"color:blue\">MORALE [" + roll + ">=" + check + "]: " + " We have RALLIED our allies!</h4>");
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
            log("Running command: " + args[1]);
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