# Transition
### An API Script for Shape, Text, Jukebox, Daylight & Macro Transitions 

As I wanted to create a dramatic opening page for my new Lord of the Rings 5e Roleplaying game (from Free League Publishing), I started writing a script to automate transparency fading. ‘Transition’ is the result, and the original scope has expanded considerably!

Here is a video showing my opening sequence just to give a sense of what the script can do:

https://video.wixstatic.com/video/6777d4_0b70cb3c5b974fe490c5a8a1715b83de/720p/mp4/file.mp4

The above video sequence was generated from:

`!transition sequence fade-jb:LoTR5e_OpeningMix:0:12 3000 #RingText -NqOagh2CoNd-UK2vApe 1000 #O-Ring -Nq81VUKHMbNM-iKaOJc 1000 #Logo -Nq4HzffCq5YTIANqhEs|-Nq4ILn0YaV8Z4GA6R6J 1000 #Background -NqTIBvszqB9c9qGYGWg 4000 #Text -Nqhf1HIqHcxsO3TJ8uP -NqmWbCG5TNtRx-u0huJ 3000 -NqmWbgjwBBFiAa7ljhd 3000 -NqmWcAUZz1oGnI6T77X 3000 -NqmWcgiXMaapJPiNAHE 3000 fade-dl:0.3:0.01:80 3000 fade-jb:LoTR5e_OpeningMix:12:0 ?{Reset||reset}`

So the whole sequence is a single macro call. The script uses setInterval and Promises to handle simultaneous and sequential transition effects, by which I mean a workflow sequence that can support, for example:

Fade in the music AS WE<br>
Fade in Shape A & Shape B simultaneously THEN<br>
Wait 3 seconds THEN<br>
Fade in Shape C and fade out Text AA simultaneously THEN<br>
Wait 5 seconds THEN<br>
Fade out Daylight & fade out Music simultaneously

(In the examples below &lt;arg> are mandatory, [arg] are optional)

### Notes, Hints & Tips

**NOTE 1**: The transparency aspect of the script ignores any colour values explicitly set to ‘transparent’. It works by using the HTML colour trick of appending opacity to a colour code e.g. #ff0000 becomes #ff0000ff. Therefore, you can explicitly set e.g. stroke or fill colour to ‘transparent’ if you want it to be ignored.

**HINT**: I found that transitioning a shape with both `fill` and `stroke` was not quite as nice as using fill alone, as the stroke (border) could be seen during the transition. So generally I left stroke explicitly transparent. This may be a browser-specific thing.

**NOTE 2**: Transition uses a number of defaults for its operations. As follows:

- Shapes and Text: Increment 4, interval 80ms (range 0 to 255, 00 to FF)
- Jukebox: Increment 2, interval 800ms (volume range 0 to 100)
- Daylight: Increment 0.025, interval 50ms (range 0.0 to 1.0))

**NOTE 3**: The script automatically ‘absolutes’ increment (and delay) values and sets the sign according to the operation.

**WARNING**: Beware of setting milliseconds too small, I found that around 50ms or less the transitions could get a bit laggy. Again maybe browser/computer dependent. I do use 10ms increments in reset operations for speed (see below).

**TIP**: If you are fading **in**, then you need to start from transparent for your selected objects. As you cannot use ‘transparent’ (as the script would never know what your target colour would be) you should EITHER set your colours manually appended with ’00’ to force transparency OR select the items and add 'reset' as the last argument to Transition (see below). I went through MANY iterations of my opening sequence to get the timings etc. correct, so for Transition sequences and Jukebox Fade you can append with ‘reset’ to get back to your starting state.

When building your sequence command it is easiest to do it in a macro and add: **?{Reset||reset}** at the end to allow easy run and reset cycles. Caveats to resetting are:

- Resetting daylight fades will set back to 100% brightness
- Resetting jukebox fades sets track start volume to end volume. Track will play if start volume > 0. (Unfortunately you cannot reset a track to its starting play point as that is not exposed by the API)
- Macros executed or wrapped by Transition obviously cannot be reset

**NOTE 4**: Jukebox Fade, Daylight Fade, Executed Macros and Wrapped Macros are ASYNCHRONOUS, they will run while other sequences are running. For me this made sense with the use cases I had in mind, and it is much easier to just multiply the increments by the ms delays and add an equivalent pause after an operation to force synchronicity, rather than pollute the ‘keyword space’ with synchronous versions, e.g.:

>transition sequence fade-jb:LoTR5e_OpeningMix:0:12 -NqOagh2CoNd-UK2vApe (Asynchronous)<br>
transition sequence fade-jb:LoTR5e_OpeningMix:0:12 4800 -NqOagh2CoNd-UK2vApe (’Synchronous’)

(The default of jukebox fade increment 2 and delay 800ms for 0 to 12 gives 6 x 800 = 4800ms)

### Simple Commands

Transition has a number of ‘convenience’ actions for ‘quick and dirty’ effects. 

###
#### !transition selected <in|out> [reset]

As implied, select a group of objects and run the script. The objects (text and shape) will fade out to transparent or in to completely opaque.
###
#### !transition fade-daylight <value 0.0 to 1.0> \[increment, default:0.04] \[milliseconds, default: 80]
Change daylight brightness. The first value can also take a number of (case-insensitive) presets:

day         (1.0)<br>
overcast    (0.8)<br>
dusk        (0.4)<br>
moonlight   (0.2)<br>
night       (0.0)<br>

This can then be macro-ed up as:

>!transition fade-daylight ?{Light Level|Day|Overcast|Dusk|Moonlight|Night}

(I stole this code from another script somewhere, or maybe off the forum, but I can't remember where ;-)
###
####  !transition fade-jukebox <track> <start volume> <end volume> \[increment, default: 2] \[milliseconds, default: 800] [reset]

Fade a jukebox track from one volume to another. These can be ‘stacked’ in a macro to do a cross-fade. e.g.:

>!transition fade-jukebox Birdsong 20 0 1 1000<br>
>!transition fade-jukebox WargRiders 0 20 1 1000
###
#### !transition wrap-macro <macro> <increment> <milliseconds> <from|to> \[from|to] \[from|to]…

This command allows you to pass repeated incremental values to a macro. An example would be:

>!transition wrap-macro LightMacro 1 500 1|5

Where LightMacro is:

>!token-mod --on has_bright_light_vision emits_bright_light emits_low_light --set bright_light_distance#arg1 low_light_distance#arg1 dim_light_opacity#20

The example would run LightMacro 5 times, incrementing the value of **arg1** by 1 every 500ms from 1 to 5.

Up to 9 arguments can be specified (**arg1 - arg9**), each with their own **to|from** values. Arguments can be re-used as shown in the example above, but note that a single increment and ms delay is applied to **all** args (at this time!). Again, you could stack different commands within one macro.

Also note that you do not have to use ANY arg values in your wrapped macro if you just want to fire it a number of times. For example, a target macro of:

>!token-mod --move 1u --ids -NweH1zHSjf9UBIQZEqO

will cause the token to move 1 unit per iteration.

**WARNING**: I added this functionality because I wanted to move page elements and there was no point reinventing the wheel as TokenMod is the go-to for this type of thing. **However**, do note that you must use **--ids** because this is an api calling an api so no selected items get passed through in the message, **and** this further means you must set the TokenMod config item to allow players to use **--ids** as the api does not pass the ‘_is player a GM_’ test within Token Mod. (Yeah, that didn’t take me half a day to find ;-))

### Utility Commands

A selection of convenience functions which helped me setup pages for transitions.

#### !transition layout-text <spacing (pixels)> <justification>

Convenience function to vertically space out a group of selected text objects and justify them using **left**, right or **center**|**centre**. The function finds the highest text item and spaces down from there.

#### !transition markup-selection

Function that adds a text box with the items ID to the top left of each selected object. Can be useful when planning sequences to keep track of ids and the location of transparent items.

#### !transition debug-on / debug-off

Off by default, a debug flag is held in the state object. When on, timestamped detailed stack-indented logging is enabled. Can be useful in complex sequences where multiple intervals are running.

#### !transition kill

Should any intervals get out of control, e.g. get into an infinite loop (which should not be possible!) then this command will kill any running intervals. Using the debug-on command is the best way to diagnose.

### Sequence

So, going back to our introduction for creating our opening screen to wow and delight our players, here is the command line again:

>!transition sequence fade-jb:LoTR5e_OpeningMix:0:12 3000 #RingText -NqOagh2CoNd-UK2vApe 1000 #O-Ring -Nq81VUKHMbNM-iKaOJc 1000 #Logo -Nq4HzffCq5YTIANqhEs|-Nq4ILn0YaV8Z4GA6R6J 1000 #Background -NqTIBvszqB9c9qGYGWg 4000 #Text -Nqhf1HIqHcxsO3TJ8uP -NqmWbCG5TNtRx-u0huJ 3000 -NqmWbgjwBBFiAa7ljhd 3000 -NqmWcAUZz1oGnI6T77X 3000 -NqmWcgiXMaapJPiNAHE 3000 fade-dl:0.3:0.01:80 3000 fade-jb:LoTR5e_OpeningMix:12:0 ?{Reset||reset}

So we can chain together series of operations using a number of elements, the var=n notation below signifies default values if omitted. Each command below opaerates as per the standalone commands detailed above.

**fade-jb**: Fade Jukebox with colon-delimited arguments of **_fade-jb:Track:StartVolume:EndVolume:[Increment=2]:[Delay=800]_**

**fade-dl**: Fade daylight with colon-delimited arguments of **_fade-dl:TargetBrightness:[Increment=0.04]:[Delay=80]_**

**exec-macro**: Execute a macro asynchronously. Takes no arguments, just fires it off: **_exec-macro:MyMacro_**

**wrap-macro**: Execute a macro with colon-delimited arguments of **_wrap-macro:MacroName:Increment:Delay:arg1-from|arg1-to:arg2-from|arg2-to:argn-from|argn-to_**

**#Comment**: As it can get a bit confusing with long sequences of IDs, any term starting with # is ignored as a comment (no spaces!)

**Number**: Any number between sequence items is used as a delay in milliseconds

**-Naaaaaaa or -Naaaaaa|-Nbbbbbb**: Shape or Text IDs for transparency transitions. Each ID tuple can take the form **_ID:[in/out]:[Increment=4]:[Delay=80]_** and multiple tuples can be pipe-delimited together for simultaneous transitions.<br> 

Note that the fade in/out variable defaults as follows: Shapes will fade **out** to transparent, text will fade **in** from transparent. That is why in the example above only the IDs are shown with no colon-delimited extra information.

So this (two shapes): **-Nq4HzffCq5YTIANqhEs|-Nq4ILn0YaV8Z4GA6R6J**<br>
Actually resolves to this: **-Nq4HzffCq5YTIANqhEs:out:4:80|-Nq4ILn0YaV8Z4GA6R6J:out:4:80**

And this (a text object): **-Nqhf1HIqHcxsO3TJ8uP**<br>
Actually resolves to this: **-Nqhf1HIqHcxsO3TJ8uP:in:4:80**

(These defaults were just the most useful for me ;-)

Any problems or suggestions then please contact me on Roll20 at https://app.roll20.net/users/2447813/coryphon

~ Coryphon ~