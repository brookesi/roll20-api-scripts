# Map Ambience
### An API Script for Ambient Soundscapes

Script and these instructions available [here](https://github.com/brookesi/roll20-api-scripts/tree/master/MapAmbience)

A demo video is available [here](https://video.wixstatic.com/video/6777d4_ae7249a79b11413b8cfe66f5f04eb8db/720p/mp4/file.mp4)

Map Ambience allows you to create ambient audio sources on a page which your players, via their hero tokens, 
experience dynamically based on their proximity to the sources.

Hero tokens are defined as tokens which are linked to character sheets where the 'controlledby' field has a 
value.

Ambient sources are defined by their name starting with ‘Ambient’ (case-sensitive!) and have a number of parameters that 
control their behaviour. There are four different types of ambient sources:

1. Whole map ambiences which are always on such as environmental sounds, wind, rain, dripping water in a cave 
and so on. we use the bar1 value to hold the volume, the tooltip to hold the track name and set the aura 1 value to 
ALL, signifying an ‘always on source’.

![MapAmbienceType1](https://static.wixstatic.com/media/6777d4_d39473c77fdc4b47aef51ad5cf45961a~mv2.png)

2. Basic proximity ambiences that change their volume based on hero token proximity, e.g. rivers, 
monsters, birds in trees etc. These sources can be linked to polygonal paths to provide dynamic sounds for 
rivers for example. For a simple source it is as above except bar 1 value and max hold the minimum and maximum
volume respectively. For a source linked to a polygonal path bar3 value holds the id of the path object. 
We can use a simple macro */w gm @{selected|token_id}* to find our path id.

![MapAmbienceType2](https://static.wixstatic.com/media/6777d4_5f5160bfb90e4d799268309a16515e15~mv2.png)

3. 'Trigger' ambiences that play a sound once (e.g. not looped) based on hero token movement such as footsteps 
in water or a repeatedly fireable trap. Again we use bar 1 for volume, tooltip and aura1 radius but also add 
a bar2 value of ‘noloop’ meaning the sound is only played once. But the source will re-trigger each time we 
are in proximity.

![MapAmbienceType3](https://static.wixstatic.com/media/6777d4_6014d2f2517648e7aebaa679fd7400c7~mv2.png)

4. 'Trigger' ambiences as above but only fire once are then 'forgotten' such as a trap or bomb. These can also 
execute a macro to create a visual effect such as showing or changing a token e.g. a pit trap or breaking something 
for example. These are set up as per #3 above but we add 'forget' to the bar2 max.

![MapAmbienceType4](https://static.wixstatic.com/media/6777d4_06ba270e11644136abd22627c35e8a5b~mv2.png)

![MapAmbienceType4a](https://static.wixstatic.com/media/6777d4_170d38ab0221432eb658af45f85ee102~mv2.png)

Each ambient soundscape is re-built on a page change, or, when designing the page a *!mapam buildAmbientState* command
can be used to rebuild the state. Once set up the soundscape automatically executes on a page change.


