import { useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';
import { formatINR, type Paise } from '@/domain/money';
import { useStore } from '@/db/store';
import { radius, space, useTheme } from '../theme';
import { Money, Row, Txt } from './core';

/** Hand-rolled SVG charts: small, themeable, no extra native dependency. */

export function ProgressRing({ value, size = 120, stroke = 12, color, trackColor, children }: { value: number; size?: number; stroke?: number; color?: string; trackColor?: string; children?: React.ReactNode }) {
  const { colors } = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor ?? colors.chartTrack} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color ?? colors.primary}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}

export interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

function arcPath(cx: number, cy: number, r: number, start: number, end: number) {
  const s = { x: cx + r * Math.cos(start), y: cy + r * Math.sin(start) };
  const e = { x: cx + r * Math.cos(end), y: cy + r * Math.sin(end) };
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

export function Donut({ slices, size = 168, stroke = 22, onSelect, centerLabel }: { slices: Slice[]; size?: number; stroke?: number; onSelect?: (key: string) => void; centerLabel?: string }) {
  const { colors } = useTheme();
  const [active, setActive] = useState<string | null>(null);
  const total = slices.reduce((a, s) => a + s.value, 0);
  const r = (size - stroke) / 2;
  const gap = slices.length > 1 ? 0.03 : 0;
  let angle = -Math.PI / 2;
  const selected = slices.find((s) => s.key === active);
  const { width: screen } = useWindowDimensions();
  const stacked = screen < 380;

  return (
    <View style={stacked ? { gap: space(2), alignItems: 'center' } : { flexDirection: 'row', gap: space(2), alignItems: 'center' }}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} style={{ position: 'absolute' }}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.chartTrack} strokeWidth={stroke} fill="none" />
          {total > 0 &&
            slices.map((s) => {
              const sweep = (s.value / total) * Math.PI * 2;
              const start = angle + gap / 2;
              const end = angle + sweep - gap / 2;
              angle += sweep;
              if (sweep >= Math.PI * 2 - 0.001) return <Circle key={s.key} cx={size / 2} cy={size / 2} r={r} stroke={s.color} strokeWidth={stroke} fill="none" />;
              if (end <= start) return null;
              return (
                <Path
                  key={s.key}
                  d={arcPath(size / 2, size / 2, r, start, end)}
                  stroke={s.color}
                  strokeWidth={active === s.key ? stroke + 6 : stroke}
                  strokeLinecap="butt"
                  fill="none"
                  opacity={active && active !== s.key ? 0.35 : 1}
                />
              );
            })}
        </Svg>
        <View style={{ alignItems: 'center', maxWidth: size - stroke * 2 - 8 }}>
          <Txt variant="caption" tone="muted" numberOfLines={1}>
            {selected ? selected.label.toUpperCase() : (centerLabel ?? 'TOTAL')}
          </Txt>
          <Money value={selected ? selected.value : total} variant="h3" compact />
          {selected && total ? (
            <Txt variant="caption" tone="muted">
              {Math.round((selected.value / total) * 100)}%
            </Txt>
          ) : null}
        </View>
      </View>
      <View style={stacked ? { alignSelf: 'stretch', gap: 8 } : { flex: 1, gap: 8 }}>
        {slices.slice(0, 6).map((s) => (
          <Pressable
            key={s.key}
            onPress={() => {
              setActive(active === s.key ? null : s.key);
              onSelect?.(s.key);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${s.label} ${formatINR(s.value)}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, opacity: active && active !== s.key ? 0.5 : 1 }}
          >
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.color }} />
            <Txt variant="small" style={{ flex: 1 }} numberOfLines={1}>
              {s.label}
            </Txt>
            <Money value={s.value} variant="small" compact />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export interface BarDatum {
  key: string;
  label: string;
  values: number[];
}

/** Grouped (or single) vertical bars with tap-to-inspect. */
export function Bars({ data, colors: seriesColors, height = 160, legend, highlightLast }: { data: BarDatum[]; colors: string[]; height?: number; legend?: string[]; highlightLast?: boolean }) {
  const { colors } = useTheme();
  const { width: screen } = useWindowDimensions();
  const hidden = useStore((s) => s.settings.hideAmounts);
  const width = screen - space(8);
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...data.flatMap((d) => d.values));
  const groupW = width / Math.max(data.length, 1);
  const series = data[0]?.values.length ?? 1;
  const barW = Math.min(18, (groupW * 0.7) / series);
  const chartH = height - 22;
  // Keep axis labels readable: at most ~8 across the chart.
  const labelStep = Math.max(1, Math.ceil(data.length / 8));

  return (
    <View style={{ gap: 8 }}>
      {active !== null && data[active] ? (
        <Row gap={1.5} style={{ minHeight: 20 }}>
          <Txt variant="small" tone="muted">
            {data[active].label}
          </Txt>
          {data[active].values.map((v, i) => (
            <Row key={i} gap={0.5}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: seriesColors[i] }} />
              <Txt variant="small">{hidden ? '••••' : formatINR(v, { compact: true })}</Txt>
            </Row>
          ))}
        </Row>
      ) : legend ? (
        <Row gap={1.5} style={{ minHeight: 20 }}>
          {legend.map((l, i) => (
            <Row key={l} gap={0.5}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: seriesColors[i] }} />
              <Txt variant="small" tone="muted">
                {l}
              </Txt>
            </Row>
          ))}
        </Row>
      ) : (
        <View style={{ minHeight: 20 }} />
      )}
      <Svg width={width} height={height}>
        <Line x1={0} x2={width} y1={chartH} y2={chartH} stroke={colors.border} strokeWidth={1} />
        {data.map((d, gi) => {
          const x0 = gi * groupW + (groupW - barW * series - (series - 1) * 3) / 2;
          const dim = (active !== null && active !== gi) || (highlightLast && active === null && gi !== data.length - 1);
          return (
            <G key={d.key} opacity={dim ? 0.45 : 1}>
              {d.values.map((v, si) => {
                const h = Math.max(v > 0 ? 3 : 0, (v / max) * (chartH - 6));
                return <Rect key={si} x={x0 + si * (barW + 3)} y={chartH - h} width={barW} height={h} rx={Math.min(5, barW / 2)} fill={seriesColors[si]} />;
              })}
              <Rect x={gi * groupW} y={0} width={groupW} height={height} fill="transparent" onPress={() => setActive(active === gi ? null : gi)} />
            </G>
          );
        })}
      </Svg>
      <View style={{ width, height: 16, marginTop: -20 }}>
        {data.map((d, i) =>
          i % labelStep === 0 || active === i ? (
            <Txt key={d.key} variant="caption" tone={active === i ? 'default' : 'faint'} style={{ position: 'absolute', left: i * groupW + groupW / 2 - 24, width: 48, textAlign: 'center' }} numberOfLines={1}>
              {d.label}
            </Txt>
          ) : null,
        )}
      </View>
    </View>
  );
}

/** Line chart with soft area fill, used for bill trends, usage and net-worth. */
export function LineChart({ points, labels, height = 150, color, format = (v: number) => formatINR(v, { compact: true }) }: { points: number[]; labels: string[]; height?: number; color?: string; format?: (v: number) => string }) {
  const { colors } = useTheme();
  const { width: screen } = useWindowDimensions();
  const hidden = useStore((s) => s.settings.hideAmounts);
  const width = screen - space(8);
  const [active, setActive] = useState<number | null>(null);
  const stroke = color ?? colors.primary;
  if (points.length < 2) {
    return (
      <Txt variant="small" tone="muted">
        Not enough history yet.
      </Txt>
    );
  }
  const min = Math.min(...points, 0);
  const max = Math.max(...points, 1);
  const chartH = height - 24;
  const x = (i: number) => (i / (points.length - 1)) * (width - 12) + 6;
  const y = (v: number) => chartH - ((v - min) / (max - min || 1)) * (chartH - 12) - 6;
  const d = points.map((p, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(p)}`).join(' ');
  const area = `${d} L ${x(points.length - 1)} ${chartH} L ${x(0)} ${chartH} Z`;
  const shown = active ?? points.length - 1;

  return (
    <View style={{ gap: 6 }}>
      <Row gap={1}>
        <Txt variant="small" tone="muted">
          {labels[shown]}
        </Txt>
        <Txt variant="bodyStrong">{hidden ? '••••' : format(points[shown])}</Txt>
      </Row>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="area" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={stroke} stopOpacity={0.28} />
            <Stop offset="1" stopColor={stroke} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {min < 0 ? <Line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke={colors.border} strokeDasharray="4 4" /> : null}
        <Path d={area} fill="url(#area)" />
        <Path d={d} stroke={stroke} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        <Circle cx={x(shown)} cy={y(points[shown])} r={5} fill={colors.surface} stroke={stroke} strokeWidth={2.5} />
        {points.map((_, i) => (
          <Rect key={i} x={x(i) - width / points.length / 2} y={0} width={width / points.length} height={height} fill="transparent" onPress={() => setActive(i)} />
        ))}
      </Svg>
      <Row style={{ justifyContent: 'space-between', marginTop: -18 }}>
        <Txt variant="caption" tone="faint">
          {labels[0]}
        </Txt>
        <Txt variant="caption" tone="faint">
          {labels[labels.length - 1]}
        </Txt>
      </Row>
    </View>
  );
}

/** GitHub-style calendar of daily spend for one month. */
export function HeatCalendar({ days, color }: { days: { date: string; amount: Paise }[]; color?: string }) {
  const { colors } = useTheme();
  const { width: screen } = useWindowDimensions();
  const hidden = useStore((s) => s.settings.hideAmounts);
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.amount));
  const first = days.length ? new Date(`${days[0].date}T12:00:00`).getDay() : 0;
  const offset = (first + 6) % 7; // Monday first
  const cell = Math.floor((screen - space(8) - 6 * 6) / 7);
  const cells = [...Array.from({ length: offset }, () => null), ...days];
  const tint = color ?? colors.expense;
  const sel = active !== null ? days[active] : null;
  return (
    <View style={{ gap: 8 }}>
      <Txt variant="small" tone="muted" style={{ minHeight: 18 }}>
        {sel ? `${Number(sel.date.slice(8))} · ${hidden ? '₹ ••••' : formatINR(sel.amount)}` : 'Tap a day'}
      </Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <Txt key={i} variant="caption" tone="faint" style={{ width: cell, textAlign: 'center' }}>
            {d}
          </Txt>
        ))}
        {cells.map((d, i) => {
          if (!d) return <View key={`e${i}`} style={{ width: cell, height: cell }} />;
          const idx = i - offset;
          const intensity = d.amount / max;
          return (
            <Pressable
              key={d.date}
              onPress={() => setActive(idx)}
              accessibilityLabel={`${d.date} ${formatINR(d.amount)}`}
              style={{
                width: cell,
                height: cell,
                borderRadius: radius.sm - 2,
                backgroundColor: d.amount ? tint : colors.chartTrack,
                opacity: d.amount ? 0.2 + intensity * 0.8 : 1,
                borderWidth: active === idx ? 2 : 0,
                borderColor: colors.text,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Txt variant="caption" style={{ color: d.amount && intensity > 0.5 ? '#fff' : colors.textMuted }}>
                {Number(d.date.slice(8))}
              </Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
