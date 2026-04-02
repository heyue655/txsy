import React, { useRef, useEffect, useState, useCallback } from 'react';

// ============================================================
// 人形轮廓坐标点（归一化 -1~1）
// 简化的站立冥想姿势，类似图中的人物剪影
// ============================================================
const SILHOUETTE_POINTS: [number, number][] = [
  // 头部（圆形）
  ...Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    return [Math.cos(a) * 0.08, 0.42 + Math.sin(a) * 0.1] as [number, number];
  }),
  // 脖子
  [0, 0.32], [-0.02, 0.30], [0.02, 0.30],
  // 肩膀
  [-0.18, 0.26], [-0.15, 0.28], [-0.12, 0.29],
  [0.18, 0.26], [0.15, 0.28], [0.12, 0.29],
  // 左臂（略收，冥想姿态）
  [-0.20, 0.22], [-0.22, 0.16], [-0.23, 0.10], [-0.22, 0.04],
  [-0.20, -0.02], [-0.16, -0.04], [-0.12, -0.02],
  // 右臂
  [0.20, 0.22], [0.22, 0.16], [0.23, 0.10], [0.22, 0.04],
  [0.20, -0.02], [0.16, -0.04], [0.12, -0.02],
  // 躯干
  [-0.12, 0.26], [-0.13, 0.18], [-0.14, 0.10], [-0.14, 0.02],
  [-0.13, -0.06], [-0.12, -0.14],
  [0.12, 0.26], [0.13, 0.18], [0.14, 0.10], [0.14, 0.02],
  [0.13, -0.06], [0.12, -0.14],
  [0, 0.20], [0, 0.12], [0, 0.04], [0, -0.04], [0, -0.12],
  // 腰部
  [-0.10, -0.16], [0.10, -0.16], [-0.06, -0.18], [0.06, -0.18],
  // 左腿
  [-0.10, -0.20], [-0.11, -0.28], [-0.12, -0.36], [-0.12, -0.44],
  [-0.11, -0.50], [-0.10, -0.56],
  // 右腿
  [0.10, -0.20], [0.11, -0.28], [0.12, -0.36], [0.12, -0.44],
  [0.11, -0.50], [0.10, -0.56],
  // 额外填充点，增加密度
  ...Array.from({ length: 60 }, () => {
    const bx = (Math.random() - 0.5) * 0.28;
    const by = (Math.random() - 0.5) * 0.5 - 0.02;
    // 简单的人形范围检测
    const w = 0.14 - Math.abs(by + 0.02) * 0.06;
    if (Math.abs(bx) < w) return [bx, by] as [number, number];
    return [bx * 0.5, by] as [number, number];
  }),
];

interface Particle {
  x: number; y: number;
  tx: number; ty: number; // target (silhouette position)
  vx: number; vy: number;
  size: number;
  alpha: number;
  phase: number;
  speed: number;
}

interface EnergyLine {
  points: { x: number; y: number }[];
  alpha: number;
  width: number;
  speed: number;
  phase: number;
  color: string;
}

interface Props {
  author: string;
  era: string;
  bookTitle: string;
  soulColor: string;
  onClose: () => void;
  onEnter?: () => void;
}

const SoulLoading: React.FC<Props> = ({ author, era, bookTitle, soulColor, onClose, onEnter }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [dots, setDots] = useState('');
  const [fadeIn, setFadeIn] = useState(false);
  const startTime = useRef(Date.now());
  const enteredRef = useRef(false);

  // 文字省略号动画
  useEffect(() => {
    const iv = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.');
    }, 400);
    return () => clearInterval(iv);
  }, []);

  // 淡入
  useEffect(() => {
    requestAnimationFrame(() => setFadeIn(true));
  }, []);

  // 2秒后自动进入对话
  useEffect(() => {
    const t = setTimeout(() => {
      if (onEnter && !enteredRef.current) {
        enteredRef.current = true;
        onEnter();
      }
    }, 2000);
    return () => clearTimeout(t);
  }, [onEnter]);

  // 解析主色
  const parseColor = useCallback((hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth * window.devicePixelRatio;
      canvas.height = window.innerHeight * window.devicePixelRatio;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();
    window.addEventListener('resize', resize);

    const W = window.innerWidth;
    const H = window.innerHeight;
    const cx = W * 0.5;
    const cy = H * 0.42;
    const scale = Math.min(W, H) * 0.7;

    const color = parseColor(soulColor);

    // 初始化粒子（从随机位置聚合到人形）
    const particles: Particle[] = SILHOUETTE_POINTS.map(([sx, sy]) => {
      const tx = cx + sx * scale;
      const ty = cy - sy * scale;
      return {
        x: cx + (Math.random() - 0.5) * W,
        y: cy + (Math.random() - 0.5) * H,
        tx, ty,
        vx: 0, vy: 0,
        size: 1 + Math.random() * 2.5,
        alpha: 0.3 + Math.random() * 0.7,
        phase: Math.random() * Math.PI * 2,
        speed: 0.5 + Math.random() * 1.5,
      };
    });

    // 额外环绕粒子（不聚合，围绕人形旋转）
    const orbitParticles: { angle: number; radius: number; speed: number; size: number; phase: number }[] =
      Array.from({ length: 120 }, () => ({
        angle: Math.random() * Math.PI * 2,
        radius: scale * (0.25 + Math.random() * 0.45),
        speed: 0.2 + Math.random() * 0.8,
        size: 0.5 + Math.random() * 1.5,
        phase: Math.random() * Math.PI * 2,
      }));

    // 能量线
    const energyLines: EnergyLine[] = Array.from({ length: 18 }, (_, i) => {
      const isCyan = i < 10;
      const pts = Array.from({ length: 40 }, (_, j) => {
        const t = j / 39;
        const startAngle = (i / 18) * Math.PI * 2;
        const r = scale * (0.08 + t * 0.55);
        return {
          x: cx + Math.cos(startAngle + t * 3) * r,
          y: cy + Math.sin(startAngle + t * 2) * r * 0.7,
        };
      });
      return {
        points: pts,
        alpha: 0.15 + Math.random() * 0.25,
        width: 0.5 + Math.random() * 1.5,
        speed: 0.3 + Math.random() * 0.7,
        phase: Math.random() * Math.PI * 2,
        color: isCyan
          ? `rgba(${color.r}, ${color.g}, ${color.b}, `
          : `rgba(${Math.min(255, color.r + 80)}, ${Math.min(255, color.g + 40)}, ${color.b}, `,
      };
    });

    // 中心光晕脉冲
    let glowPhase = 0;

    const animate = () => {
      const elapsed = (Date.now() - startTime.current) / 1000;
      const W = window.innerWidth;
      const H = window.innerHeight;
      ctx.clearRect(0, 0, W, H);

      // 背景
      ctx.fillStyle = '#000408';
      ctx.fillRect(0, 0, W, H);

      // 聚合进度（1.5秒内聚合）
      const gatherProgress = Math.min(1, elapsed / 1.5);
      const eased = 1 - Math.pow(1 - gatherProgress, 3);

      // 能量线绘制
      energyLines.forEach(line => {
        const t = elapsed * line.speed + line.phase;
        ctx.beginPath();
        ctx.strokeStyle = line.color + (line.alpha * (0.5 + 0.5 * Math.sin(t))).toFixed(3) + ')';
        ctx.lineWidth = line.width;
        line.points.forEach((p, j) => {
          const wobble = Math.sin(t + j * 0.15) * 8;
          const px = p.x + wobble;
          const py = p.y + Math.cos(t + j * 0.1) * 5;
          if (j === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
      });

      // 中心光晕
      glowPhase += 0.02;
      const glowR = scale * (0.15 + 0.05 * Math.sin(glowPhase));
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
      grd.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${0.6 + 0.2 * Math.sin(glowPhase)})`);
      grd.addColorStop(0.4, `rgba(${color.r}, ${color.g}, ${color.b}, 0.15)`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);

      // 人形粒子聚合
      particles.forEach(p => {
        p.x += (p.tx - p.x) * 0.02 * eased + Math.sin(elapsed * p.speed + p.phase) * (1 - eased) * 2;
        p.y += (p.ty - p.y) * 0.02 * eased + Math.cos(elapsed * p.speed + p.phase) * (1 - eased) * 2;
        const flicker = 0.5 + 0.5 * Math.sin(elapsed * p.speed * 2 + p.phase);
        const a = p.alpha * flicker * eased;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${Math.min(255, color.r + 60)}, ${Math.min(255, color.g + 60)}, ${Math.min(255, color.b + 60)}, ${a.toFixed(3)})`;
        ctx.fill();

        // 粒子光晕
        if (p.size > 1.5) {
          const pGrd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
          pGrd.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${(a * 0.3).toFixed(3)})`);
          pGrd.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = pGrd;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // 环绕粒子
      orbitParticles.forEach(op => {
        op.angle += op.speed * 0.008;
        const wobble = Math.sin(elapsed * 1.5 + op.phase) * 20;
        const ox = cx + Math.cos(op.angle) * (op.radius + wobble);
        const oy = cy + Math.sin(op.angle) * (op.radius * 0.6 + wobble * 0.5);
        const oa = (0.3 + 0.3 * Math.sin(elapsed * op.speed + op.phase)) * eased;
        ctx.beginPath();
        ctx.arc(ox, oy, op.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${oa.toFixed(3)})`;
        ctx.fill();
      });

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [soulColor, parseColor]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#000408',
        opacity: fadeIn ? 1 : 0,
        transition: 'opacity 0.6s ease-in',
      }}
    >
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0 }} />

      {/* 文字层 */}
      <div style={{
        position: 'absolute',
        bottom: '15%',
        width: '100%',
        textAlign: 'center',
        fontFamily: '"KaiTi", "STKaiti", serif',
        pointerEvents: 'none',
      }}>
        <div style={{
          fontSize: 'clamp(1.2rem, 4vw, 2rem)',
          color: soulColor,
          textShadow: `0 0 20px ${soulColor}, 0 0 40px ${soulColor}80`,
          marginBottom: '12px',
          letterSpacing: '4px',
          animation: 'pulse-text 2s ease-in-out infinite',
        }}>
          正在链接 {era} 的{author}{dots}
        </div>
        <div style={{
          fontSize: 'clamp(0.7rem, 2vw, 0.9rem)',
          color: 'rgba(255,255,255,0.5)',
          letterSpacing: '2px',
        }}>
          {bookTitle} · 灵魂召唤
        </div>
      </div>



      {/* 返回按钮 */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          color: 'rgba(255,255,255,0.6)',
          fontSize: '1.5rem',
          cursor: 'pointer',
          zIndex: 10000,
          padding: '8px 12px',
          pointerEvents: 'auto',
        }}
      >
        ‹
      </div>

      {/* 标题 */}
      <div style={{
        position: 'absolute',
        top: '20px',
        width: '100%',
        textAlign: 'center',
        color: 'rgba(255,255,255,0.7)',
        fontSize: 'clamp(0.9rem, 3vw, 1.2rem)',
        fontFamily: '"KaiTi", "STKaiti", serif',
        letterSpacing: '6px',
        pointerEvents: 'none',
      }}>
        灵魂召唤
      </div>

      {/* CSS 动画 */}
      <style>{`
        @keyframes pulse-text {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 1; }
        }
        @keyframes enter-fadein {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default SoulLoading;
