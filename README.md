# Explosiovania Map Viewer

Interactive map of every region in *Explosiovania*, drawn like the in-game map, with every Health/Soul upgrade, ability, red key, golden key, soul door, red key door, golden key door, snake race, checkpoint, NPC hint and lever.

**Open it:** https://nerodev7.github.io/Explosiovania-Map-Viewer/

## See what you are missing

Click **Load save…** (or drag the file onto the page) and pick your save:

```
%APPDATA%\Godot\app_userdata\Explosiovania\saves\save0.save
```

`save0` is slot 1, `save1` slot 2, and so on. Collected items get a green tick, every region shows its count, and **Hide collected** leaves only what is still missing.

The save is read in your browser only. Nothing is uploaded, and the page never writes to your save file.

## Notes

- Positions come from the game files. Markers marked "approximate" are in the right room, but the exact spot inside the room is estimated.
- Snake race medal times: Bronze = 5x Gold, Silver = 2x Gold, Developer = the hidden time.
- Works offline too: download the repository and open `index.html`.

## Credits

Fan-made, not affiliated with the developer of Explosiovania. The map icons and map data come from the game and belong to its developer. Font: Notable (SIL Open Font License). Code: MIT (see `LICENSE`).
