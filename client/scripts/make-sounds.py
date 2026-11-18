"""Writes the app's synthesized sounds into assets/sounds. Run: python3 scripts/make-sounds.py

They are made here, so they have no outside source or license.
- turn-tick: a soft wooden tick, about 60 ms, for each of the last 5 seconds of your turn.
- turn-chime: two bell notes rising a fifth, about 0.9 s, when your turn starts.
- checker-hit: a heavy knock, about 0.3 s, when a backgammon checker is hit and sent to the bar.
- checker-place: a soft wooden thud, about 0.13 s, when a backgammon checker lands.
- dice-clack-1 to 3: a dice knock, about 70 ms, each a little higher, for each bounce in the cup.
The place and clack sounds are the tones the app used to synthesize live, now rendered to files.
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


def hit() -> list[float]:
    """Heavier than the checker place sound: a low thump, a wooden knock and a short rattle."""
    random.seed(11)
    length = int(RATE * 0.3)
    out = []
    low = 0.0
    for index in range(length):
        time = index / RATE
        # The thump drops in pitch as it dies away, like a checker slammed onto wood.
        thump_freq = 70 + 90 * math.exp(-time / 0.03)
        thump = math.sin(2 * math.pi * thump_freq * time) * math.exp(-time / 0.08)
        knock = math.sin(2 * math.pi * 410 * time) * math.exp(-time / 0.025) * 0.7
        knock += math.sin(2 * math.pi * 860 * time) * math.exp(-time / 0.012) * 0.35
        low += (random.uniform(-1, 1) - low) * 0.25
        rattle = low * math.exp(-time / 0.006) * 0.9
        # A second, softer knock as the checker settles.
        later = time - 0.055
        settle = math.sin(2 * math.pi * 520 * later) * math.exp(-later / 0.018) * 0.3 if later > 0 else 0.0
        attack = min(1.0, index / (RATE * 0.0015))
        out.append((thump + knock + rattle + settle) * attack)
    return out


def bandpass(samples: list[float], center: float, q: float) -> list[float]:
    """A plain biquad band-pass filter (constant peak gain)."""
    omega = 2 * math.pi * center / RATE
    alpha = math.sin(omega) / (2 * q)
    b0, b1, b2 = alpha, 0.0, -alpha
    a0, a1, a2 = 1 + alpha, -2 * math.cos(omega), 1 - alpha
    out = []
    x1 = x2 = y1 = y2 = 0.0
    for x in samples:
        y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0
        out.append(y)
        x2, x1, y2, y1 = x1, x, y1, y
    return out


def sweep_phase(start: float, end: float, glide: float, time: float) -> float:
    """Phase of a tone gliding exponentially from start to end Hz over `glide` seconds."""
    if time <= glide:
        ratio = end / start
        return 2 * math.pi * start * glide * (ratio ** (time / glide) - 1) / math.log(ratio)
    return sweep_phase(start, end, glide, glide) + 2 * math.pi * end * (time - glide)


def envelope(time: float, peak_at: float, end_at: float) -> float:
    """Exponential rise to 1 and fall to silence, like Web Audio's exponential ramps."""
    floor = 0.0001
    if time < peak_at:
        return floor * (1 / floor) ** (time / peak_at)
    if time < end_at:
        return (floor) ** ((time - peak_at) / (end_at - peak_at))
    return 0.0


def place() -> list[float]:
    length = int(RATE * 0.13)
    return [
        math.sin(sweep_phase(200, 70, 0.09, index / RATE)) * envelope(index / RATE, 0.008, 0.12)
        for index in range(length)
    ]


def triangle(phase: float) -> float:
    return 2 / math.pi * math.asin(math.sin(phase))


def clack(start: float, seed: int) -> list[float]:
    random.seed(seed)
    length = int(RATE * 0.08)
    tone = [triangle(sweep_phase(start, 70, 0.06, index / RATE)) for index in range(length)]
    tone = bandpass(tone, 900, 1.0)
    out = []
    for index, value in enumerate(tone):
        time = index / RATE
        body = value * envelope(time, 0.004, 0.07) * 0.32
        noise = 0.0
        if time < 0.04:
            noise = random.uniform(-1, 1) * (1 - time / 0.04) * 0.18 * envelope(time, 0.0001, 0.04)
        out.append(body + noise)
    return out


write("turn-tick.wav", tick())
write("turn-chime.wav", chime())
write("checker-hit.wav", hit())
write("checker-place.wav", place())
for number, (start, seed) in enumerate(((280, 21), (420, 22), (560, 23)), start=1):
    write(f"dice-clack-{number}.wav", clack(start, seed))
print("Wrote the turn, checker and dice sounds to", OUT)
