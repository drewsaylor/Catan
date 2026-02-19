#!/usr/bin/env python3
from __future__ import annotations

import binascii
import math
import os
import random
import struct
import zlib
from dataclasses import dataclass
from pathlib import Path


def clamp_int(n: float, lo: int, hi: int) -> int:
  if n < lo:
    return lo
  if n > hi:
    return hi
  return int(n)


def rgba(r: int, g: int, b: int, a: int = 255) -> tuple[int, int, int, int]:
  return (clamp_int(r, 0, 255), clamp_int(g, 0, 255), clamp_int(b, 0, 255), clamp_int(a, 0, 255))


@dataclass
class Canvas:
  w: int
  h: int
  # Premultiplied RGBA bytes.
  buf: bytearray

  @classmethod
  def create(cls, w: int, h: int) -> "Canvas":
    return cls(w=w, h=h, buf=bytearray(w * h * 4))

  def _blend_px_premul(self, x: int, y: int, pr: int, pg: int, pb: int, pa: int) -> None:
    if pa <= 0:
      return
    if x < 0 or y < 0 or x >= self.w or y >= self.h:
      return
    i = (y * self.w + x) * 4
    dst_r = self.buf[i + 0]
    dst_g = self.buf[i + 1]
    dst_b = self.buf[i + 2]
    dst_a = self.buf[i + 3]
    inv = 255 - pa
    self.buf[i + 0] = pr + (dst_r * inv) // 255
    self.buf[i + 1] = pg + (dst_g * inv) // 255
    self.buf[i + 2] = pb + (dst_b * inv) // 255
    self.buf[i + 3] = pa + (dst_a * inv) // 255

  def blend_px(self, x: int, y: int, color: tuple[int, int, int, int]) -> None:
    r, g, b, a = color
    if a <= 0:
      return
    pr = (r * a) // 255
    pg = (g * a) // 255
    pb = (b * a) // 255
    self._blend_px_premul(x, y, pr, pg, pb, a)

  def fill_ellipse(self, cx: float, cy: float, rx: float, ry: float, angle_rad: float, color: tuple[int, int, int, int]) -> None:
    if rx <= 0 or ry <= 0:
      return
    cos_a = math.cos(angle_rad)
    sin_a = math.sin(angle_rad)

    min_x = clamp_int(math.floor(cx - rx - 2), 0, self.w - 1)
    max_x = clamp_int(math.ceil(cx + rx + 2), 0, self.w - 1)
    min_y = clamp_int(math.floor(cy - ry - 2), 0, self.h - 1)
    max_y = clamp_int(math.ceil(cy + ry + 2), 0, self.h - 1)

    inv_rx2 = 1.0 / (rx * rx)
    inv_ry2 = 1.0 / (ry * ry)

    for y in range(min_y, max_y + 1):
      py = (y + 0.5) - cy
      for x in range(min_x, max_x + 1):
        px = (x + 0.5) - cx
        lx = px * cos_a + py * sin_a
        ly = -px * sin_a + py * cos_a
        if (lx * lx) * inv_rx2 + (ly * ly) * inv_ry2 <= 1.0:
          self.blend_px(x, y, color)

  def fill_circle(self, cx: float, cy: float, r: float, color: tuple[int, int, int, int]) -> None:
    self.fill_ellipse(cx, cy, r, r, 0.0, color)

  def fill_polygon(self, pts: list[tuple[float, float]], color: tuple[int, int, int, int]) -> None:
    if len(pts) < 3:
      return

    min_y_f = min(y for _, y in pts)
    max_y_f = max(y for _, y in pts)
    min_y = clamp_int(math.floor(min_y_f), 0, self.h - 1)
    max_y = clamp_int(math.ceil(max_y_f), 0, self.h - 1)

    n = len(pts)
    for y in range(min_y, max_y + 1):
      scan_y = y + 0.5
      xs: list[float] = []
      for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        if y1 == y2:
          continue
        if (y1 <= scan_y < y2) or (y2 <= scan_y < y1):
          t = (scan_y - y1) / (y2 - y1)
          xs.append(x1 + t * (x2 - x1))
      xs.sort()
      for i in range(0, len(xs), 2):
        if i + 1 >= len(xs):
          break
        x0 = int(math.ceil(xs[i] - 0.5))
        x1 = int(math.floor(xs[i + 1] - 0.5))
        if x1 < x0:
          continue
        x0 = max(0, x0)
        x1 = min(self.w - 1, x1)
        for x in range(x0, x1 + 1):
          self.blend_px(x, y, color)

  def stroke_segment(self, x1: float, y1: float, x2: float, y2: float, width: float, color: tuple[int, int, int, int]) -> None:
    if width <= 0:
      return
    r = width / 2.0
    min_x = clamp_int(math.floor(min(x1, x2) - r - 2), 0, self.w - 1)
    max_x = clamp_int(math.ceil(max(x1, x2) + r + 2), 0, self.w - 1)
    min_y = clamp_int(math.floor(min(y1, y2) - r - 2), 0, self.h - 1)
    max_y = clamp_int(math.ceil(max(y1, y2) + r + 2), 0, self.h - 1)

    vx = x2 - x1
    vy = y2 - y1
    vv = vx * vx + vy * vy
    if vv <= 1e-6:
      self.fill_circle(x1, y1, r, color)
      return
    inv_vv = 1.0 / vv
    rr = r * r

    for y in range(min_y, max_y + 1):
      py = y + 0.5
      for x in range(min_x, max_x + 1):
        px = x + 0.5
        wx = px - x1
        wy = py - y1
        t = (wx * vx + wy * vy) * inv_vv
        if t < 0.0:
          t = 0.0
        elif t > 1.0:
          t = 1.0
        proj_x = x1 + t * vx
        proj_y = y1 + t * vy
        dx = px - proj_x
        dy = py - proj_y
        if dx * dx + dy * dy <= rr:
          self.blend_px(x, y, color)

  def stroke_polyline(self, pts: list[tuple[float, float]], width: float, color: tuple[int, int, int, int], closed: bool = False) -> None:
    if len(pts) < 2:
      return
    for i in range(len(pts) - 1):
      x1, y1 = pts[i]
      x2, y2 = pts[i + 1]
      self.stroke_segment(x1, y1, x2, y2, width, color)
    if closed:
      x1, y1 = pts[-1]
      x2, y2 = pts[0]
      self.stroke_segment(x1, y1, x2, y2, width, color)

  def downsample2(self) -> "Canvas":
    # 2x downsample with box filter. Works on premultiplied buffer.
    out_w = self.w // 2
    out_h = self.h // 2
    out = Canvas.create(out_w, out_h)
    for y in range(out_h):
      for x in range(out_w):
        acc_r = 0
        acc_g = 0
        acc_b = 0
        acc_a = 0
        for dy in (0, 1):
          for dx in (0, 1):
            sx = x * 2 + dx
            sy = y * 2 + dy
            i = (sy * self.w + sx) * 4
            acc_r += self.buf[i + 0]
            acc_g += self.buf[i + 1]
            acc_b += self.buf[i + 2]
            acc_a += self.buf[i + 3]
        oi = (y * out_w + x) * 4
        out.buf[oi + 0] = acc_r // 4
        out.buf[oi + 1] = acc_g // 4
        out.buf[oi + 2] = acc_b // 4
        out.buf[oi + 3] = acc_a // 4
    return out

  def to_png_bytes(self) -> bytes:
    # Convert premultiplied buffer -> straight alpha for PNG encoding.
    raw = bytearray()
    for y in range(self.h):
      raw.append(0)  # filter: none
      for x in range(self.w):
        i = (y * self.w + x) * 4
        pr = self.buf[i + 0]
        pg = self.buf[i + 1]
        pb = self.buf[i + 2]
        a = self.buf[i + 3]
        if a == 0:
          raw.extend((0, 0, 0, 0))
          continue
        r = min(255, (pr * 255) // a)
        g = min(255, (pg * 255) // a)
        b = min(255, (pb * 255) // a)
        raw.extend((r, g, b, a))

    compressed = zlib.compress(bytes(raw), level=9)

    def chunk(tag: bytes, data: bytes) -> bytes:
      crc = binascii.crc32(tag)
      crc = binascii.crc32(data, crc) & 0xFFFFFFFF
      return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    signature = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", self.w, self.h, 8, 6, 0, 0, 0)
    return signature + chunk(b"IHDR", ihdr) + chunk(b"IDAT", compressed) + chunk(b"IEND", b"")


def rot(x: float, y: float, angle: float) -> tuple[float, float]:
  c = math.cos(angle)
  s = math.sin(angle)
  return (x * c - y * s, x * s + y * c)


def transform_points(pts: list[tuple[float, float]], cx: float, cy: float, angle: float) -> list[tuple[float, float]]:
  out: list[tuple[float, float]] = []
  for x, y in pts:
    rx, ry = rot(x, y, angle)
    out.append((rx + cx, ry + cy))
  return out


def chamfered_rect_points(w: float, h: float, c: float) -> list[tuple[float, float]]:
  hw = w / 2.0
  hh = h / 2.0
  c = max(0.0, min(c, hw, hh))
  # Clockwise.
  return [
    (hw - c, -hh),
    (hw, -hh + c),
    (hw, hh - c),
    (hw - c, hh),
    (-hw + c, hh),
    (-hw, hh - c),
    (-hw, -hh + c),
    (-hw + c, -hh),
  ]


def draw_brick(canvas: Canvas, cx: float, cy: float, angle: float, scale: float, seed: int) -> None:
  rnd = random.Random(seed)

  base_w = 80.0 * scale
  base_h = 34.0 * scale
  chamfer = 6.0 * scale

  outline = rgba(25, 23, 23, 255)
  fill = rgba(207, 84, 66, 255)
  fill2 = rgba(226, 105, 80, 255)
  shadow = rgba(0, 0, 0, 60)
  hi = rgba(255, 255, 255, 46)
  lo = rgba(0, 0, 0, 38)

  local = chamfered_rect_points(base_w, base_h, chamfer)
  pts = transform_points(local, cx, cy, angle)

  # Drop-shadow under brick.
  shadow_pts = [(x + 7 * scale, y + 9 * scale) for x, y in pts]
  canvas.fill_polygon(shadow_pts, shadow)

  # Brick fill: slightly varied per brick.
  mix = rnd.random()
  brick_fill = rgba(
    int(fill[0] * (1 - mix) + fill2[0] * mix),
    int(fill[1] * (1 - mix) + fill2[1] * mix),
    int(fill[2] * (1 - mix) + fill2[2] * mix),
    255,
  )
  canvas.fill_polygon(pts, brick_fill)

  # Simple lighting: highlight on top-left, shadow on bottom-right (in local space).
  # Highlight triangle.
  hl_local = [
    (-base_w / 2 + chamfer, -base_h / 2 + chamfer),
    (base_w * 0.15, -base_h / 2 + chamfer),
    (-base_w / 2 + chamfer, base_h * 0.15),
  ]
  canvas.fill_polygon(transform_points(hl_local, cx, cy, angle), hi)

  # Shadow quad.
  sh_local = [
    (base_w * 0.05, -base_h * 0.35),
    (base_w / 2 - chamfer, -base_h * 0.05),
    (base_w / 2 - chamfer, base_h / 2 - chamfer),
    (base_w * 0.05, base_h / 2 - chamfer),
  ]
  canvas.fill_polygon(transform_points(sh_local, cx, cy, angle), lo)

  # Chips / mortar smears.
  if rnd.random() < 0.65:
    smear = rgba(192, 180, 170, 180)
    sx = -base_w * 0.2 + rnd.random() * base_w * 0.4
    sy = -base_h * 0.42 + rnd.random() * base_h * 0.2
    smear_local = [
      (sx - 10 * scale, sy + 0),
      (sx - 2 * scale, sy - 4 * scale),
      (sx + 10 * scale, sy - 2 * scale),
      (sx + 8 * scale, sy + 5 * scale),
      (sx - 6 * scale, sy + 6 * scale),
    ]
    canvas.fill_polygon(transform_points(smear_local, cx, cy, angle), smear)

  # Cracks.
  crack = rgba(40, 25, 22, 150)
  for _ in range(2 + int(rnd.random() * 2)):
    x0 = (rnd.random() - 0.5) * base_w * 0.7
    y0 = (rnd.random() - 0.5) * base_h * 0.6
    x1 = x0 + (rnd.random() - 0.5) * base_w * 0.25
    y1 = y0 + (rnd.random() - 0.5) * base_h * 0.18
    p0 = transform_points([(x0, y0), (x1, y1)], cx, cy, angle)
    canvas.stroke_segment(p0[0][0], p0[0][1], p0[1][0], p0[1][1], 2.0 * scale, crack)

  # Speckles (limited so it stays fast).
  speck = rgba(0, 0, 0, 24)
  for _ in range(12):
    lx = (rnd.random() - 0.5) * base_w * 0.85
    ly = (rnd.random() - 0.5) * base_h * 0.7
    rx, ry = rot(lx, ly, angle)
    canvas.fill_circle(cx + rx, cy + ry, 1.4 * scale, speck)

  # Outline last.
  canvas.stroke_polyline(pts, 6.5 * scale, outline, closed=True)


def draw_bricks_icon(canvas: Canvas) -> None:
  # Background smudge.
  canvas.fill_ellipse(126, 140, 92, 62, 0.0, rgba(50, 54, 62, 26))
  canvas.fill_ellipse(170, 152, 70, 48, 0.0, rgba(50, 54, 62, 18))
  canvas.fill_ellipse(95, 158, 72, 44, 0.0, rgba(50, 54, 62, 16))

  # Ground shadow.
  canvas.fill_ellipse(128, 196, 102, 26, 0.0, rgba(0, 0, 0, 40))

  bricks = [
    # Back layer
    (118, 150, math.radians(-8), 0.92, 1),
    (150, 150, math.radians(10), 0.92, 2),
    (104, 172, math.radians(6), 0.96, 3),
    (165, 172, math.radians(-6), 0.96, 4),
    # Middle
    (90, 188, math.radians(2), 1.02, 5),
    (128, 190, math.radians(-4), 1.06, 6),
    (170, 190, math.radians(4), 1.02, 7),
    (110, 126, math.radians(-14), 0.9, 8),
    (146, 126, math.radians(16), 0.9, 9),
    # Front
    (78, 206, math.radians(-10), 1.12, 10),
    (128, 214, math.radians(4), 1.12, 11),
    (182, 206, math.radians(12), 1.1, 12),
    # Tossed on top
    (132, 106, math.radians(6), 0.88, 13),
    (100, 156, math.radians(-28), 0.92, 14),
    (162, 158, math.radians(26), 0.92, 15),
  ]

  # Draw back-to-front in order.
  for cx, cy, a, s, seed in bricks:
    draw_brick(canvas, cx, cy, a, s, seed)

  # Small loose brick chips.
  outline = rgba(25, 23, 23, 255)
  chip = rgba(200, 80, 62, 255)
  for (cx, cy, a) in [(72, 224, -12), (196, 224, 14), (62, 216, 6)]:
    pts = transform_points(chamfered_rect_points(22, 12, 3), cx, cy, math.radians(a))
    canvas.fill_polygon(pts, chip)
    canvas.stroke_polyline(pts, 5.5, outline, closed=True)


def draw_wheat_icon(canvas: Canvas) -> None:
  outline = rgba(24, 22, 22, 255)
  grain = rgba(244, 194, 74, 255)
  grain_hi = rgba(255, 234, 160, 255)
  stem = rgba(210, 154, 48, 255)
  tie = rgba(44, 52, 66, 255)

  canvas.fill_ellipse(128, 206, 84, 22, 0.0, rgba(0, 0, 0, 34))

  stems = [
    [(112, 236), (110, 196), (112, 160), (106, 120), (106, 90)],
    [(124, 238), (124, 198), (126, 160), (126, 120), (124, 84)],
    [(136, 238), (138, 198), (138, 160), (140, 120), (140, 88)],
    [(148, 236), (152, 196), (152, 158), (156, 120), (158, 94)],
    [(100, 236), (96, 196), (96, 160), (92, 124), (90, 98)],
  ]

  for pts in stems:
    canvas.stroke_polyline(pts, 10.0, outline)
    canvas.stroke_polyline(pts, 6.6, stem)

  def grain_ellipse(cx: float, cy: float, angle_deg: float, size: float) -> None:
    ang = math.radians(angle_deg)
    canvas.fill_ellipse(cx, cy, 9.0 * size, 6.0 * size, ang, outline)
    canvas.fill_ellipse(cx, cy, 7.2 * size, 4.8 * size, ang, grain)
    canvas.fill_ellipse(cx - 1.5 * size, cy - 1.2 * size, 3.2 * size, 2.2 * size, ang, rgba(grain_hi[0], grain_hi[1], grain_hi[2], 140))

  # Heads: scatter grains along stems.
  placements = []
  for i, pts in enumerate(stems):
    # Take upper 3 points for head axis.
    top_x, top_y = pts[-1]
    mid_x, mid_y = pts[-2]
    base_x, base_y = pts[-3]
    for t in [0.0, 0.35, 0.7, 1.0, 1.35]:
      cx = mid_x + (top_x - base_x) * 0.05 + (i - 2) * 1.8 + (t - 0.6) * 2.2
      cy = base_y - 18 - t * 14
      ang = (-30 + i * 14) + (t * 6)
      placements.append((cx, cy, ang, 0.95 - t * 0.08))
      placements.append((cx - 10 + i * 1.6, cy + 8, ang + 38, 0.9 - t * 0.06))

  for cx, cy, ang, size in placements:
    grain_ellipse(cx, cy, ang, max(0.55, size))

  # Tie wrap.
  wrap = [
    (104, 184),
    (118, 196),
    (138, 196),
    (154, 184),
    (140, 210),
    (118, 210),
  ]
  canvas.fill_polygon(wrap, outline)
  inner = [
    (108, 186),
    (120, 196),
    (136, 196),
    (150, 186),
    (138, 206),
    (120, 206),
  ]
  canvas.fill_polygon(inner, tie)

  # Small bow.
  bow_l = [(118, 202), (106, 196), (112, 210)]
  bow_r = [(138, 202), (152, 196), (146, 210)]
  canvas.fill_polygon(bow_l, outline)
  canvas.fill_polygon(bow_r, outline)
  canvas.fill_polygon([(118, 202), (110, 198), (114, 208)], rgba(255, 255, 255, 26))
  canvas.fill_polygon([(138, 202), (146, 198), (142, 208)], rgba(255, 255, 255, 24))


def draw_sheep(canvas: Canvas) -> None:
  outline = rgba(22, 22, 24, 255)
  wool = rgba(245, 247, 250, 255)
  wool2 = rgba(214, 222, 232, 255)
  face = rgba(30, 38, 50, 255)
  face_hi = rgba(255, 255, 255, 36)

  canvas.fill_ellipse(140, 210, 92, 22, 0.0, rgba(0, 0, 0, 34))

  def sheep(cx: float, cy: float, scale: float, facing: int, back: bool) -> None:
    # Legs.
    leg_w = 14 * scale
    leg_h = 30 * scale
    legs = [(-28, 34), (-8, 34), (12, 34), (32, 34)]
    if back:
      legs = [(-22, 34), (-2, 34), (18, 34)]
    for lx, ly in legs:
      x0 = cx + lx * scale - leg_w / 2
      y0 = cy + ly * scale - leg_h / 2
      pts = [(x0, y0), (x0 + leg_w, y0), (x0 + leg_w, y0 + leg_h), (x0, y0 + leg_h)]
      canvas.fill_polygon(pts, outline)
      canvas.fill_polygon([(x0 + 2, y0 + 2), (x0 + leg_w - 2, y0 + 2), (x0 + leg_w - 2, y0 + leg_h - 2), (x0 + 2, y0 + leg_h - 2)], face)

    # Wool body (ellipse + puffs).
    body_rx = 66 * scale
    body_ry = 46 * scale
    canvas.fill_ellipse(cx, cy, body_rx + 6 * scale, body_ry + 6 * scale, 0.0, outline)
    canvas.fill_ellipse(cx, cy, body_rx, body_ry, 0.0, wool if not back else wool2)
    # Puffy highlights.
    for ox, oy, r in [(-34, -10, 18), (-6, -20, 20), (26, -12, 18), (-22, 18, 16), (14, 20, 16)]:
      canvas.fill_circle(cx + ox * scale, cy + oy * scale, r * scale, rgba(255, 255, 255, 30))

    # Tail.
    canvas.fill_circle(cx - (body_rx + 8 * scale), cy + 6 * scale, 14 * scale, outline)
    canvas.fill_circle(cx - (body_rx + 8 * scale), cy + 6 * scale, 11 * scale, wool if not back else wool2)

    # Head.
    hx = cx + (body_rx - 6 * scale) * (1 if facing > 0 else -1)
    hy = cy - 10 * scale
    canvas.fill_ellipse(hx, hy, 36 * scale, 28 * scale, 0.0, outline)
    canvas.fill_ellipse(hx, hy, 32 * scale, 24 * scale, 0.0, face)
    # Ear.
    ex = hx + (18 * scale) * (1 if facing > 0 else -1)
    canvas.fill_polygon(
      [(ex, hy - 20 * scale), (ex + 18 * scale * facing, hy - 32 * scale), (ex + 10 * scale * facing, hy - 10 * scale)],
      outline,
    )
    canvas.fill_polygon(
      [(ex + 1, hy - 20 * scale), (ex + 16 * scale * facing, hy - 30 * scale), (ex + 9 * scale * facing, hy - 12 * scale)],
      face,
    )

    # Eye + smile.
    eye_x = hx + 10 * scale * facing
    eye_y = hy - 4 * scale
    canvas.fill_circle(eye_x, eye_y, 4.2 * scale, rgba(255, 255, 255, 230))
    canvas.fill_circle(eye_x, eye_y, 2.0 * scale, rgba(0, 0, 0, 140))
    canvas.stroke_segment(hx - 10 * scale * facing, hy + 10 * scale, hx + 8 * scale * facing, hy + 12 * scale, 5.0 * scale, rgba(255, 255, 255, 120))
    canvas.fill_ellipse(hx - 6 * scale * facing, hy - 14 * scale, 16 * scale, 10 * scale, 0.0, face_hi)

  # Back sheep first.
  sheep(100, 150, 0.85, facing=1, back=True)
  sheep(146, 166, 1.0, facing=1, back=False)


def draw_wood(canvas: Canvas) -> None:
  outline = rgba(22, 22, 24, 255)
  bark = rgba(154, 96, 54, 255)
  bark_hi = rgba(210, 168, 120, 255)
  cut = rgba(242, 220, 190, 255)
  ring = rgba(120, 78, 46, 120)

  canvas.fill_ellipse(136, 214, 100, 24, 0.0, rgba(0, 0, 0, 34))

  def log(x1: float, y1: float, x2: float, y2: float, radius: float, seed: int) -> None:
    rnd = random.Random(seed)
    # Outline + fill capsule.
    canvas.stroke_segment(x1, y1, x2, y2, (radius + 6) * 2, outline)
    canvas.stroke_segment(x1, y1, x2, y2, radius * 2, bark)
    # Highlight strip.
    canvas.stroke_segment(x1 - 3, y1 - 3, x2 - 3, y2 - 3, (radius * 0.55) * 2, rgba(bark_hi[0], bark_hi[1], bark_hi[2], 140))

    # End cuts: circles.
    for (cx, cy) in [(x1, y1), (x2, y2)]:
      canvas.fill_circle(cx, cy, radius + 6, outline)
      canvas.fill_circle(cx, cy, radius, cut)
      # Rings.
      for rr in [radius * 0.65, radius * 0.4, radius * 0.22]:
        canvas.stroke_segment(cx - rr, cy, cx + rr, cy, 2.4, rgba(ring[0], ring[1], ring[2], int(ring[3])))
      # Small knot.
      if rnd.random() < 0.6:
        canvas.fill_ellipse(cx - 10, cy + 6, 10, 6, 0.0, rgba(0, 0, 0, 28))

    # Bark texture slashes.
    for _ in range(6):
      t = rnd.random()
      px = x1 + (x2 - x1) * t
      py = y1 + (y2 - y1) * t
      canvas.stroke_segment(px - 4, py - 8, px + 2, py + 8, 3.2, rgba(0, 0, 0, 22))

  # Three stacked logs.
  log(64, 150, 196, 170, 28, 1)
  log(56, 184, 206, 206, 30, 2)
  log(86, 118, 206, 126, 26, 3)


def draw_ore(canvas: Canvas) -> None:
  outline = rgba(22, 22, 24, 255)
  rock = rgba(26, 33, 44, 255)
  rock_hi = rgba(88, 104, 124, 255)
  gold = rgba(242, 198, 92, 255)
  silver = rgba(198, 220, 242, 255)

  canvas.fill_ellipse(140, 220, 92, 26, 0.0, rgba(0, 0, 0, 38))

  # Rock shape.
  pts = [
    (86, 74),
    (140, 60),
    (194, 88),
    (224, 140),
    (206, 206),
    (142, 228),
    (84, 206),
    (52, 146),
    (62, 98),
  ]
  canvas.fill_polygon(pts, outline)
  inner = [(x + 3, y + 3) for x, y in pts]
  canvas.fill_polygon(inner, rock)

  # Facet highlight.
  canvas.fill_polygon([(92, 96), (140, 72), (168, 112), (124, 126)], rgba(rock_hi[0], rock_hi[1], rock_hi[2], 140))
  canvas.fill_polygon([(118, 166), (162, 150), (186, 184), (144, 206)], rgba(0, 0, 0, 44))

  # Metallic veins (outlined then filled).
  veins = [
    [(70, 130), (110, 112), (146, 120), (190, 106)],
    [(90, 186), (126, 168), (164, 172), (206, 150)],
  ]
  for pts2 in veins:
    canvas.stroke_polyline(pts2, 14.0, outline)
    canvas.stroke_polyline(pts2, 9.0, gold if pts2[0][1] < 160 else silver)
    canvas.stroke_polyline(pts2, 4.5, rgba(255, 255, 255, 46))

  # Gems.
  def gem(cx: float, cy: float, s: float, fill: tuple[int, int, int, int]) -> None:
    diamond = [
      (cx, cy - 18 * s),
      (cx + 16 * s, cy - 6 * s),
      (cx + 10 * s, cy + 16 * s),
      (cx - 10 * s, cy + 16 * s),
      (cx - 16 * s, cy - 6 * s),
    ]
    canvas.fill_polygon(diamond, outline)
    inner = [(x * 0.0 + x * 1.0, y * 0.0 + y * 1.0) for x, y in diamond]
    inner = [(x + (1.8 * s if x > cx else -1.8 * s if x < cx else 0), y + 1.8 * s) for x, y in diamond]
    canvas.fill_polygon(inner, fill)
    canvas.fill_polygon([(cx - 6 * s, cy - 6 * s), (cx + 4 * s, cy - 10 * s), (cx + 8 * s, cy - 2 * s), (cx - 2 * s, cy + 2 * s)], rgba(255, 255, 255, 70))

  gem(184, 140, 1.0, rgba(95, 211, 255, 255))
  gem(132, 148, 1.0, rgba(176, 137, 255, 255))
  gem(96, 176, 1.0, rgba(201, 255, 79, 255))

  # Glints.
  for cx, cy, a in [(202, 124, 0.85), (116, 196, 0.65)]:
    canvas.fill_polygon([(cx, cy - 10), (cx + 4, cy - 2), (cx + 12, cy), (cx + 4, cy + 2), (cx, cy + 10), (cx - 4, cy + 2), (cx - 12, cy), (cx - 4, cy - 2)], rgba(255, 255, 255, int(210 * a)))


def generate_icons(out_dir: Path) -> None:
  out_dir.mkdir(parents=True, exist_ok=True)

  icons: list[tuple[str, callable[[Canvas], None]]] = [
    ("brick.png", draw_bricks_icon),
    ("wheat.png", draw_wheat_icon),
    ("sheep.png", draw_sheep),
    ("wood.png", draw_wood),
    ("ore.png", draw_ore),
  ]

  for filename, draw_fn in icons:
    hi = Canvas.create(512, 512)
    # Transparent background by default; just draw centered at 256-scale by using coordinates already in 256.
    # Scale 256-coordinates up 2x by drawing into a larger canvas and scaling all coordinates in draw fns.
    # Instead, draw at 256-space and multiply coordinates by 2 using a temporary transform:
    # easiest: call draw into a proxy canvas by monkeypatching dimensions. We'll just scale coordinates manually:
    # Here: render by scaling the canvas itself and scaling inside by a factor of 2 via helper.
    scaled = Canvas.create(512, 512)

    # Draw function expects 256-space; we render by temporarily drawing into a 256 canvas then upsample via nearest,
    # but that loses quality. So: draw directly into hi with coordinates doubled by wrapping methods.
    class ScaledCanvas(Canvas):
      def blend_px(self, x: int, y: int, color: tuple[int, int, int, int]) -> None:  # type: ignore[override]
        return hi.blend_px(x, y, color)

      def fill_ellipse(self, cx: float, cy: float, rx: float, ry: float, angle_rad: float, color: tuple[int, int, int, int]) -> None:  # type: ignore[override]
        return hi.fill_ellipse(cx * 2, cy * 2, rx * 2, ry * 2, angle_rad, color)

      def fill_circle(self, cx: float, cy: float, r: float, color: tuple[int, int, int, int]) -> None:  # type: ignore[override]
        return hi.fill_circle(cx * 2, cy * 2, r * 2, color)

      def fill_polygon(self, pts: list[tuple[float, float]], color: tuple[int, int, int, int]) -> None:  # type: ignore[override]
        return hi.fill_polygon([(x * 2, y * 2) for x, y in pts], color)

      def stroke_segment(self, x1: float, y1: float, x2: float, y2: float, width: float, color: tuple[int, int, int, int]) -> None:  # type: ignore[override]
        return hi.stroke_segment(x1 * 2, y1 * 2, x2 * 2, y2 * 2, width * 2, color)

      def stroke_polyline(self, pts: list[tuple[float, float]], width: float, color: tuple[int, int, int, int], closed: bool = False) -> None:  # type: ignore[override]
        return hi.stroke_polyline([(x * 2, y * 2) for x, y in pts], width * 2, color, closed=closed)

    draw_fn(ScaledCanvas(w=512, h=512, buf=hi.buf))

    lo = hi.downsample2()
    out_path = out_dir / filename
    out_path.write_bytes(lo.to_png_bytes())


def main() -> int:
  repo_root = Path(__file__).resolve().parents[1]
  out_dir = repo_root / "apps" / "server" / "public" / "shared" / "icons"
  generate_icons(out_dir)
  print("Wrote PNG icons to:", out_dir)
  for name in ["brick.png", "wheat.png", "sheep.png", "wood.png", "ore.png"]:
    p = out_dir / name
    print(f"- {name}: {p.stat().st_size} bytes")
  return 0


if __name__ == "__main__":
  raise SystemExit(main())

