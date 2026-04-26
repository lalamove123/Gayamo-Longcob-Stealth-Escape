# 🕹️ Pacman: Shadow Escape – Stealth Arcade Game

A **2D stealth‑arcade game** where you play as Pac‑Man, but now you must avoid enemy vision cones, collect keys, use power‑ups, and escape – all while staying hidden. Built with HTML5 Canvas and pure JavaScript.

## ✨ Features

- **Stealth‑first gameplay** – Enemies have a field‑of‑view cone. Stay out of it or you'll be detected.
- **3‑stage alert system**:  
  🟢 **SAFE** – no enemy sees you.  
  🟡 **SUSPICIOUS** – you're inside a cone; a bar fills up quickly.  
  🔴 **DETECTED** – game over.
- **3 golden keys** scattered across the maze – collect all to unlock the exit.
- **8 power‑ups** – 4 invisibility (`👁`) and 4 speed (`⚡`).  
  - Invisibility makes you completely undetectable (even if you touch a ghost!).  
  - Speed doubles your movement.
- **100% dot coverage** – every walkable tile has a dot (except start, exit, keys, power‑ups).
- **Proximity instant kill** – if you touch a ghost while **not** invisible or on a safe tile → game over immediately.
- **Pause / Resume** – press `P` or click the on‑screen button.
- **Fully synthesized audio** – no external sound files required. All sounds (footsteps, alerts, power‑ups, music) are generated with the Web Audio API.
- **Mobile support** – touch‑friendly D‑pad for smartphones.
- **Procedural music** – menu theme (arpeggio) and gameplay theme (bass + hi‑hat) loop seamlessly.

## 🎮 How to Play

1. **Move** – `WASD` or **Arrow Keys** (also on‑screen D‑pad for mobile).
2. **Collect dots** – each dot gives 10 points.
3. **Find the 3 keys** – each key gives 100 points.
4. **Grab power‑ups** – invisibility (`👁`) makes you vanish for 6 seconds; speed (`⚡`) makes you faster.
5. **Avoid enemy vision cones** – the yellow warning bar fills while you're inside. Escape before it reaches full.
6. **Don't touch ghosts** – unless you're invisible or standing on a purple safe zone.
7. **Exit** – once all dots and all 3 keys are collected, the exit door glows green. Walk into it to win.

## 🧠 Detection Logic (Important!)

The game checks detection in this **exact order**:

1. **Invisibility power‑up active** → no detection (safe passage through ghosts).
2. **Standing on a safe (shadow) tile** → no detection.
3. **Player touches a ghost** → instant game over (only if not invisible and not on safe tile).
4. **Normal vision cone** → range, angle, line‑of‑sight → fills suspicion bar → game over after 0.9 seconds.

This means invisibility truly protects you – you can walk right through enemies unharmed.

## 🕹️ Controls

| Action            | Keyboard           | Touch / Mobile          |
|-------------------|--------------------|-------------------------|
| Move up           | `↑` or `W`         | Up button on D‑pad      |
| Move down         | `↓` or `S`         | Down button             |
| Move left         | `←` or `A`         | Left button             |
| Move right        | `→` or `D`         | Right button            |
| Pause / Resume    | `P`                | On‑screen "⏸ Pause" button |
