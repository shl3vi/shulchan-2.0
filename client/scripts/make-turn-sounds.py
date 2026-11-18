"""Writes assets/sounds/turn-tick.wav and turn-chime.wav. Run: python3 scripts/make-turn-sounds.py

Both are synthesized here, so they have no outside source or license.
- turn-tick: a soft wooden tick, about 60 ms, for each of the last 5 seconds of your turn.
- turn-chime: two bell notes rising a fifth, about 0.9 s, when your turn starts.
"""

import math
import random
import struct
import wave
from pathlib import Path

RATE = 44100
OUT = Path(__file__).resolve().parent.parent / "assets" / "sounds"


def write(name: str, samples: list[float]) -> None:
    peak = max(abs(value) for value in samples) or 1.0
    scale = 0.89 / peak
    with wave.open(str(OUT / name), "wb") as file:
        file.setnchannels(1)
        file.setsampwidth(2)
        file.setframerate(RATE)
        file.writeframes(b"".join(struct.pack("<h", int(value * scale * 32767)) for value in samples))


def tick() -> list[float]:
    random.seed(7)
    length = int(RATE * 0.06)
    out = []
    low = 0.0
    for index in range(length):
        time = index / RATE
        body = math.sin(2 * math.pi * 1250 * time) * math.exp(-time / 0.012)
        knock = math.sin(2 * math.pi * 620 * time) * math.exp(-time / 0.02) * 0.5
        # A little filtered noise at the start makes it a tap rather than a beep.
        low += (random.uniform(-1, 1) - low) * 0.35
        click = low * math.exp(-time / 0.003) * 0.6
        attack = min(1.0, index / (RATE * 0.0008))
        out.append((body + knock + click) * attack)
    return out


def bell(frequency: float, time: float) -> float:
    partials = ((1.0, 1.0, 0.9), (2.0, 0.35, 0.5), (3.01, 0.15, 0.3), (4.2, 0.06, 0.18))
    return sum(
        gain * math.sin(2 * math.pi * frequency * ratio * time) * math.exp(-time / decay)
        for ratio, gain, decay in partials
    )


def chime() -> list[float]:
    length = int(RATE * 0.95)
    second = 0.13
    out = []
    for index in range(length):
        time = index / RATE
        attack = min(1.0, index / (RATE * 0.004))
        value = bell(784.0, time) * attack
        if time >= second:
            later = time - second
            value += 0.9 * bell(1174.7, later) * min(1.0, later / 0.004)
        fade = min(1.0, (length - index) / (RATE * 0.08))
        out.append(value * fade)
    return out


write("turn-tick.wav", tick())
write("turn-chime.wav", chime())
print("Wrote turn-tick.wav and turn-chime.wav to", OUT)
