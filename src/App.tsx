import React, { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import QRCode from 'qrcode';
import { STATIC_STARS_COUNT, TWINKLING_STARS_COUNT, METEORS_COUNT } from './config';
import SoulLoading from './SoulLoading';
import SoulDialog from './SoulDialog';
import DeanDialog from './DeanDialog';
import LoginModal from './LoginModal';

// 给 API 返回的书籍生成 3D 位置
function generateBookPos(index: number): THREE.Vector3 {
  return new THREE.Vector3(
    (Math.random() - 0.5) * 220,
    (Math.random() - 0.5) * 140,
    -index * 30 - Math.random() * 20
  );
}

/**
 * 前景组件：主体书籍星球 (保持 $1\times 1 \to 10\times 10$ 震撼放大效果)
 */
// 每本书随机选一个书籍 emoji
const BOOK_EMOJIS = ['📖','📚','📕','📗','📘','📙','📜','🗞️','📃','📄'];

const FlyingBook = ({ data, onSoulDialog, onDismiss, isFocused, pausedBookId, onPause, slotIndex, onRecycle }: {
  data: { id: string; title: string; author: string; era: string; soulColor: string; pos: THREE.Vector3; color: string };
  onSoulDialog: (book: any) => void;
  onDismiss: () => void;
  isFocused: boolean;
  pausedBookId: string | null;
  onPause: (id: string | null) => void;
  slotIndex: number;
  onRecycle: (id: string) => void;
}) => {
  const ref = useRef<THREE.Group>(null);
  const labelRef = useRef<THREE.Group>(null);
  const emojiRef = useRef<any>(null);
  const { camera, size } = useThree();
  const bookEmoji = useMemo(() => BOOK_EMOJIS[Math.floor(Math.random() * BOOK_EMOJIS.length)], []);
  const zPos = useRef(data.pos.z);
  const bookSpeed = useRef(5.0 + Math.random() * 4.0);
  const recycledRef = useRef(false);

  const isPaused = pausedBookId === data.id;

  // 焦点目标位置（屏幕正中近处）
  const FOCUS_TARGET = useMemo(() => new THREE.Vector3(0, 0, -18), []);

  const handleClick = (e: any) => {
    e.stopPropagation();
    // 聚焦状态下点击触发灵魂对话
    if (isFocused) {
      if (onSoulDialog) {
        const pos3d = ref.current!.position.clone();
        pos3d.project(camera);
        const screenX = (pos3d.x * 0.5 + 0.5) * size.width;
        const screenY = (-pos3d.y * 0.5 + 0.5) * size.height;
        onSoulDialog(data, { x: screenX, y: screenY });
      }
      return;
    }
    if (isPaused) {
      // 点击已暂停的书 → 恢复
      if (onPause) onPause(null);
      if (onDismiss) onDismiss();
    } else {
      // 暂停此书（自动取消上一本）
      if (onPause) onPause(data.id);
      if (onSoulDialog) {
        const pos3d = ref.current!.position.clone();
        pos3d.project(camera);
        const screenX = (pos3d.x * 0.5 + 0.5) * size.width;
        const screenY = (-pos3d.y * 0.5 + 0.5) * size.height;
        onSoulDialog(data, { x: screenX, y: screenY });
      }
    }
  };

  useFrame((_, delta) => {
    if (!ref.current) return;
    if (labelRef.current) {
      labelRef.current.quaternion.copy(camera.quaternion);
      // 恒定屏幕尺寸：补偿父级缩放 + 透视缩小
      const depth = Math.max(5, -ref.current.position.z);
      const parentScale = Math.max(0.1, ref.current.scale.x);
      const labelScale = Math.min(14, Math.max(0.3, (depth * 0.14) / parentScale));
      labelRef.current.scale.setScalar(labelScale);
    }
    // emoji 与 label 同步朝向相机
    if (emojiRef.current) {
      emojiRef.current.quaternion.copy(camera.quaternion);
    }

    // 聚焦模式：飞向正前方中央
    if (isFocused) {
      ref.current.position.lerp(FOCUS_TARGET, 0.06);
      ref.current.scale.setScalar(THREE.MathUtils.lerp(ref.current.scale.x, 2.5, 0.04));
      // 实时更新按钮坐标
      if (onSoulDialog) {
        const pos3d = ref.current.position.clone();
        pos3d.project(camera);
        const screenX = (pos3d.x * 0.5 + 0.5) * size.width;
        const screenY = (-pos3d.y * 0.5 + 0.5) * size.height;
        onSoulDialog(data, { x: screenX, y: screenY }, true);
      }
      return;
    }

    if (isPaused) {
      if (onSoulDialog) {
        const pos3d = ref.current.position.clone();
        pos3d.project(camera);
        const screenX = (pos3d.x * 0.5 + 0.5) * size.width;
        const screenY = (-pos3d.y * 0.5 + 0.5) * size.height;
        onSoulDialog(data, { x: screenX, y: screenY }, true);
      }
      return;
    }

    zPos.current += bookSpeed.current * delta * 3;

    if (zPos.current > 15) {
      if (onRecycle && !recycledRef.current) {
        recycledRef.current = true;
        onRecycle(slotIndex);
        return;
      }
      zPos.current = -300 - Math.random() * 200;
      ref.current.position.x = (Math.random() - 0.5) * 220;
      ref.current.position.y = (Math.random() - 0.5) * 140;
      bookSpeed.current = 5.0 + Math.random() * 4.0;
    }

    const progress = THREE.MathUtils.smoothstep(zPos.current, -500, 0);
    const dynamicScale = 1 + (progress * 5);
    ref.current.position.z = zPos.current;
    ref.current.scale.setScalar(Math.max(0.1, dynamicScale));
  });

  return (
    <group ref={ref} position={data.pos} onClick={handleClick}>
      {/* 横排：emoji 左 + 文字右 */}
      <group ref={labelRef}>
        {/* emoji 在左侧 */}
        <group ref={emojiRef}>
          <Text
            position={[-0.55, 0, 0]}
            fontSize={0.52}
            anchorX="center"
            anchorY="middle"
            renderOrder={1}
          >
            {bookEmoji}
          </Text>
        </group>
        {/* 书名 + 作者在右侧 */}
        <Text
          position={[-0.1, 0.12, 0]}
          fontSize={0.22}
          maxWidth={2.0}
          color={isPaused || isFocused ? (data.soulColor || '#ffd700') : '#ffe9c4'}
          anchorX="left"
          anchorY="middle"
          textAlign="left"
          lineHeight={1.2}
          renderOrder={2}
          outlineWidth={0.025}
          outlineColor="#120600"
        >
          {data.title}
        </Text>
        <Text
          position={[-0.1, -0.14, 0]}
          fontSize={0.16}
          color={isPaused || isFocused ? (data.soulColor || '#ffd700') : '#ffd49a'}
          anchorX="left"
          anchorY="middle"
          textAlign="left"
          renderOrder={2}
          outlineWidth={0.022}
          outlineColor="#120600"
        >
          {data.author}
        </Text>
      </group>
    </group>
  );
};

// ============================================================
// 静态繁星 Vertex Shader
// aSize  : 每颗星的像素尺寸（经透视衰减，远小近大）
// aColor : 每颗星的基础颜色
// ============================================================
const STATIC_STAR_VERT = `
  attribute float aSize;
  attribute vec3  aColor;
  varying   vec3  vColor;
  void main() {
    vColor = aColor;
    vec4 mvPos    = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize  = aSize * (2000.0 / -mvPos.z);
    gl_PointSize  = clamp(gl_PointSize, 0.8, 12.0);
    gl_Position   = projectionMatrix * mvPos;
  }
`;
const STATIC_STAR_FRAG = `
  varying vec3 vColor;
  void main() {
    vec2  uv   = gl_PointCoord - 0.5;
    float dist = length(uv);
    if (dist > 0.5) discard;
    float glow = 1.0 - smoothstep(0.0, 0.5, dist);
    gl_FragColor = vec4(vColor, glow * 0.95);
  }
`;

// ============================================================
// 闪烁繁星 Vertex Shader
// aIsMono : 1.0 = 黑白闪烁（000→fff）  0.0 = 彩色闪烁
// ============================================================
const TWINKLE_STAR_VERT = `
  attribute float aSize;
  attribute vec3  aBaseColor;
  attribute float aPhase;
  attribute float aSpeed;
  attribute float aIsMono;
  uniform   float uTime;
  varying   vec3  vColor;
  varying   float vAlpha;
  void main() {
    float raw     = 0.5 + 0.5 * sin(uTime * aSpeed + aPhase);
    float flicker = smoothstep(0.15, 0.85, raw);
    if (aIsMono > 0.5) {
      vColor = vec3(flicker);
      vAlpha = flicker;
    } else {
      vColor = aBaseColor * (0.1 + 0.9 * flicker);
      vAlpha = 0.8 + 0.2 * flicker;
    }
    vec4 mvPos   = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (2000.0 / -mvPos.z);
    gl_PointSize = clamp(gl_PointSize, 1.0, 20.0);
    gl_Position  = projectionMatrix * mvPos;
  }
`;
const TWINKLE_STAR_FRAG = `
  varying vec3  vColor;
  varying float vAlpha;
  void main() {
    vec2  uv   = gl_PointCoord - 0.5;
    float dist = length(uv);
    if (dist > 0.5) discard;
    float glow = 1.0 - smoothstep(0.0, 0.5, dist);
    gl_FragColor = vec4(vColor, glow * glow * vAlpha);
  }
`;

/**
 * ============================================================
 * 静态繁星（58000 颗）
 * 全部静态，无动画，性能最优
 * ---- 可调参数 ----
 * STATIC_STARS_COUNT : 星星数量        (config.js)
 * MIN_PX / MAX_PX    : 星点基准像素尺寸 (会进一步透视衰减)
 * BRIGHT_MIN         : 最暗星睿的亮度系数
 * BRIGHT_MAX         : 最亮星睿的亮度系数
 * ============================================================
 */
const BackgroundStars = () => {
  const points = useMemo(() => {
    const count = STATIC_STARS_COUNT;
    const pos   = new Float32Array(count * 3);
    const col   = new Float32Array(count * 3);
    const siz   = new Float32Array(count);

    // 冷色调色板
    const palette: [number,number,number][] = [
      [0.75, 0.85, 1.00],
      [0.82, 0.78, 1.00],
      [0.70, 0.92, 0.95],
    ];

    for (let i = 0; i < count; i++) {
      pos[i*3]   = (Math.random()-0.5) * 1000;
      pos[i*3+1] = (Math.random()-0.5) * 600;
      pos[i*3+2] = -10 - Math.random() * 990;

      const c = palette[Math.floor(Math.random() * palette.length)];
      // 亮度渐变：5% 的星非常亮（过曝白光），15% 较亮，其余正常
      const r = Math.random();
      let bright;
      if (r < 0.05) {
        bright = 1.8 + Math.random() * 1.2;  // 极亮星 1.8~3.0（过曝光晕）
      } else if (r < 0.20) {
        bright = 0.8 + Math.random() * 1.0;   // 较亮星 0.8~1.8
      } else {
        bright = 0.15 + Math.random() * 0.65; // 普通星 0.15~0.80
      }
      col[i*3]   = c[0] * bright;
      col[i*3+1] = c[1] * bright;
      col[i*3+2] = c[2] * bright;

      // 尺寸分布：与亮度关联，极亮星更大，普通星小
      if (r < 0.05) {
        siz[i] = 3.0 + Math.random() * 2.0;  // 极亮大星 3~5
      } else if (r < 0.20) {
        siz[i] = 1.8 + Math.random() * 1.5;  // 较亮中星 1.8~3.3
      } else {
        siz[i] = 0.6 + Math.random() * 1.4;  // 普通星 0.6~2.0
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor',   new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize',    new THREE.BufferAttribute(siz, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader:   STATIC_STAR_VERT,
      fragmentShader: STATIC_STAR_FRAG,
      transparent: true,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
    });

    return new THREE.Points(geo, mat);
  }, []);

  return <primitive object={points} />;
};

/**
 * ============================================================
 * 银河（密集星带 + 淡蓝辉光）
 * ---- 可调参数 ----
 * MILKYWAY_STARS : 银河星点数量
 * ANGLE          : 银河斜角 (rad)
 * SPREAD_FACTOR  : 银河宽度（越大越宽）
 * OPACITY        : 银河坏整体透明度
 * ============================================================
 */
const MILKYWAY_STARS = 15000;  // 银河星点数量（多一些才能看得到）
const MilkyWay = () => {
  const points = useMemo(() => {
    const ANGLE = 0.4;           // 银河斜角
    const LENGTH = 1200;         // 银河长度
    const NARROW_SPREAD = 30;    // 银河中心窄带宽度
    const WIDE_SPREAD = 100;     // 银河外围弥散带

    const pos = new Float32Array(MILKYWAY_STARS * 3);
    const col = new Float32Array(MILKYWAY_STARS * 3);
    const siz = new Float32Array(MILKYWAY_STARS);

    for (let i = 0; i < MILKYWAY_STARS; i++) {
      const along = (Math.random() - 0.5) * LENGTH;

      // 高斯分布：用 Box-Muller 让中心密、边缘散
      const u1 = Math.random() || 0.001;
      const u2 = Math.random();
      const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      // 70% 星在窄带，30% 在外围扩散
      const isCore = Math.random() < 0.7;
      const spread = gaussian * (isCore ? NARROW_SPREAD : WIDE_SPREAD);

      const cosA = Math.cos(ANGLE);
      const sinA = Math.sin(ANGLE);
      pos[i*3]   = along * cosA - spread * sinA;
      pos[i*3+1] = along * sinA + spread * cosA;
      pos[i*3+2] = -50 - Math.random() * 800;

      // 中心星更亮，边缘暗淡
      const distFromCenter = Math.abs(gaussian) / 3;
      const centerBright = Math.max(0, 1.0 - distFromCenter * 0.8);

      // 银河色调: 中心偏白/淡黄，边缘偏蓝/紫
      let r, g, b;
      if (isCore && Math.random() < 0.4) {
        // 中心亮星：白/淡黄
        r = 0.9 + Math.random() * 0.1;
        g = 0.85 + Math.random() * 0.15;
        b = 0.75 + Math.random() * 0.25;
      } else {
        // 边缘：蓝/紫/青
        const p = Math.random();
        if (p < 0.4) {
          r = 0.55 + Math.random()*0.2; g = 0.65 + Math.random()*0.2; b = 1.0;
        } else if (p < 0.7) {
          r = 0.70 + Math.random()*0.15; g = 0.60 + Math.random()*0.15; b = 1.0;
        } else {
          r = 0.55 + Math.random()*0.15; g = 0.85 + Math.random()*0.1; b = 0.9 + Math.random()*0.1;
        }
      }

      const bright = (0.2 + centerBright * 0.8) * (0.3 + Math.random() * 0.7);
      col[i*3]   = r * bright;
      col[i*3+1] = g * bright;
      col[i*3+2] = b * bright;

      // 中心星稍大，边缘小
      siz[i] = isCore ? (0.6 + Math.random() * 1.2) : (0.3 + Math.random() * 0.5);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor',   new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize',    new THREE.BufferAttribute(siz, 1));

    // 银河用同一个圆形光点 Shader，显示为柔和光晕
    const mat = new THREE.ShaderMaterial({
      vertexShader:   STATIC_STAR_VERT,
      fragmentShader: STATIC_STAR_FRAG,
      transparent: true,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
    });

    return new THREE.Points(geo, mat);
  }, []);

  return <primitive object={points} />;
};

/**
 * ============================================================
 * 闪烁繁星（50 颗）
 * 前 20 颗：黑白变化（#000000 ⇒ #ffffff ，彻底消失到纯白）
 * 后 30 颗：冷色调彩色闪烁
 * ---- 可调参数 ----
 * TWINKLING_STARS_COUNT : 闪烁星总数         (config.js = 50)
 * MONO_COUNT            : 黑白闪烁星数量       (= 20)
 * SPEED_MIN / MAX       : 闪烁频率 rad/s          (0.2~1.8)
 * BASE_SIZE             : 闪烁星基准尺寸（比静态星大）
 * ============================================================
 */
const MONO_COUNT = 50;  // ★ 可调：黑白闪烁星的数量
const TwinklingStars = () => {
  const pointsRef = useRef<THREE.Points>(null);

  const { pts, uniforms } = useMemo(() => {
    const count = TWINKLING_STARS_COUNT;
    // ---- 可调参数 ----
    const SPEED_MIN = 0.2;  // 最慢闪烁频率 (rad/s)
    const SPEED_MAX = 1.8;  // 最快闪烁频率 (rad/s)
    const BASE_SIZE = 12.0;  // 闪烁星基准尺寸（越大越显眼）
    // ------------------

    const pos  = new Float32Array(count * 3);
    const col  = new Float32Array(count * 3);
    const pha  = new Float32Array(count);
    const spd  = new Float32Array(count);
    const siz  = new Float32Array(count);
    const mono = new Float32Array(count);

    const palette: [number,number,number][] = [
      [0.75, 0.85, 1.00],
      [0.82, 0.78, 1.00],
      [0.70, 0.92, 0.95],
    ];

    for (let i = 0; i < count; i++) {
      // 闪烁星分布在较近处（Z -20 ~ -250），更容易被看到
      pos[i*3]   = (Math.random()-0.5) * 500;
      pos[i*3+1] = (Math.random()-0.5) * 350;
      pos[i*3+2] = -20 - Math.random() * 230;

      pha[i]  = Math.random() * Math.PI * 2;
      spd[i]  = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN);
      siz[i]  = BASE_SIZE * (0.5 + Math.random() * 1.0);  // 4~16 基准尺寸

      if (i < MONO_COUNT) {
        // 前 20 颗：黑白彻底闪烁（基础色白色，由 shader 动态控制尺度）
        mono[i]   = 1.0;
        col[i*3]  = 1.0; col[i*3+1] = 1.0; col[i*3+2] = 1.0;
      } else {
        // 后 30 颗：彩色闪烁
        mono[i] = 0.0;
        const c = palette[Math.floor(Math.random()*palette.length)];
        col[i*3] = c[0]; col[i*3+1] = c[1]; col[i*3+2] = c[2];
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position',   new THREE.BufferAttribute(pos,  3));
    geo.setAttribute('aBaseColor', new THREE.BufferAttribute(col,  3));
    geo.setAttribute('aPhase',     new THREE.BufferAttribute(pha,  1));
    geo.setAttribute('aSpeed',     new THREE.BufferAttribute(spd,  1));
    geo.setAttribute('aSize',      new THREE.BufferAttribute(siz,  1));
    geo.setAttribute('aIsMono',    new THREE.BufferAttribute(mono, 1));

    const unif = { uTime: { value: 0 } };
    const mat  = new THREE.ShaderMaterial({
      vertexShader:   TWINKLE_STAR_VERT,
      fragmentShader: TWINKLE_STAR_FRAG,
      uniforms:       unif,
      transparent:    true,
      depthWrite:     false,
      blending:       THREE.AdditiveBlending,
    });

    return { pts: new THREE.Points(geo, mat), uniforms: unif };
  }, []);

  useFrame(({ clock }) => {
    uniforms.uTime.value = clock.elapsedTime;
  });

  return <primitive ref={pointsRef} object={pts} />;
};

/**
 * 流星组件：在星空深处从左上/右上角往下斜落
 * 拖尾用点阵实现：记录历史世界坐标，从头到尾逐渐变小变淡
 */
const TRAIL_COUNT = 48; // 拖尾点数量

// 拖尾 shader：每个点有独立 alpha 和尺寸
const TRAIL_VERT = `
  attribute float aAlpha;
  attribute float aSize;
  varying float vAlpha;
  void main() {
    vAlpha = aAlpha;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (2000.0 / -mvPos.z);
    gl_PointSize = clamp(gl_PointSize, 0.5, 40.0);
    gl_Position = projectionMatrix * mvPos;
  }
`;
const TRAIL_FRAG = `
  varying float vAlpha;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float dist = length(uv);
    if (dist > 0.5) discard;
    float glow = 1.0 - smoothstep(0.0, 0.5, dist);
    // 中心纯白，边缘微金
    vec3 col = mix(vec3(1.0, 0.92, 0.7), vec3(1.0), glow);
    gl_FragColor = vec4(col, glow * glow * vAlpha);
  }
`;

const SingleMeteor = () => {
  const trailPointsRef = useRef<THREE.Points>(null);
  const emojiRef = useRef<any>(null);
  const { camera } = useThree();

  const meteorPos = useRef(new THREE.Vector3(0, -9999, -300));
  const params = useRef({ speed: 0, dirX: 0, dirY: 0 });
  const cooldown = useRef(1 + Math.random() * 2);
  const active = useRef(false);

  // 位置历史缓冲：index 0 = 最新（头部），index N = 最旧（尾部）
  const history = useRef(new Float32Array(TRAIL_COUNT * 3));

  const { trailGeo, trailMat } = useMemo(() => {
    const pos = new Float32Array(TRAIL_COUNT * 3);
    const alpha = new Float32Array(TRAIL_COUNT);
    const size = new Float32Array(TRAIL_COUNT);

    for (let i = 0; i < TRAIL_COUNT; i++) {
      pos[i * 3 + 1] = -9999;
      const t = i / (TRAIL_COUNT - 1); // 0=头 1=尾
      alpha[i] = Math.pow(1.0 - t, 1.5);
      size[i] = 8.0 * (1.0 - t * 0.9); // 头部 8，尾部 ~0.8
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader: TRAIL_VERT,
      fragmentShader: TRAIL_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    return { trailGeo: geo, trailMat: mat };
  }, []);

  // 隐藏所有可见元素
  const hideAll = useCallback(() => {
    const pa = trailGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < TRAIL_COUNT; i++) {
      pa.setXYZ(i, 0, -9999, -300);
      history.current[i * 3] = 0;
      history.current[i * 3 + 1] = -9999;
      history.current[i * 3 + 2] = -300;
    }
    pa.needsUpdate = true;
    if (emojiRef.current) {
      emojiRef.current.position.set(0, -9999, -300);
    }
  }, [trailGeo]);

  const launchMeteor = useCallback(() => {
    const fromLeft = Math.random() < 0.5;
    const x = fromLeft ? -150 - Math.random() * 200 : 150 + Math.random() * 200;
    const y = 80 + Math.random() * 150;
    const z = -500 - Math.random() * 200;
    meteorPos.current.set(x, y, z);

    const dirX = fromLeft ? (0.3 + Math.random() * 0.5) : -(0.3 + Math.random() * 0.5);
    const dirY = -(0.6 + Math.random() * 0.4);
    params.current = { speed: 6.5 + Math.random() * 8.0, dirX, dirY };
    active.current = true;

    // 所有历史点初始化到起飞位置
    for (let i = 0; i < TRAIL_COUNT; i++) {
      history.current[i * 3] = x;
      history.current[i * 3 + 1] = y;
      history.current[i * 3 + 2] = z;
    }
  }, []);

  useFrame((_, delta) => {
    if (!active.current) {
      cooldown.current -= delta;
      if (cooldown.current <= 0) launchMeteor();
      return;
    }

    // 移动流星
    const { speed, dirX, dirY } = params.current;
    const s = speed * delta * 80;
    meteorPos.current.x += dirX * s;
    meteorPos.current.y += dirY * s;

    // 位置历史：所有旧位置后移一格，新位置插入 index 0
    const h = history.current;
    for (let i = TRAIL_COUNT - 1; i > 0; i--) {
      h[i * 3] = h[(i - 1) * 3];
      h[i * 3 + 1] = h[(i - 1) * 3 + 1];
      h[i * 3 + 2] = h[(i - 1) * 3 + 2];
    }
    h[0] = meteorPos.current.x;
    h[1] = meteorPos.current.y;
    h[2] = meteorPos.current.z;

    // 写入 geometry
    const posAttr = trailGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < TRAIL_COUNT; i++) {
      posAttr.setXYZ(i, h[i * 3], h[i * 3 + 1], h[i * 3 + 2]);
    }
    posAttr.needsUpdate = true;

    // ☆ emoji 跟随头部
    if (emojiRef.current) {
      emojiRef.current.position.copy(meteorPos.current);
      emojiRef.current.quaternion.copy(camera.quaternion);
    }

    // 出界 → 立即隐藏一切，进入冷却（边界足够大，确保完全飞出屏幕外）
    if (meteorPos.current.y < -600 || Math.abs(meteorPos.current.x) > 800) {
      active.current = false;
      cooldown.current = 3 + Math.random() * 2;
      hideAll();
    }
  });

  return (
    <>
      {/* 白色拖尾光点 — 关闭视锥裁剪，防止 boundingSphere 过期导致不渲染 */}
      <points ref={trailPointsRef} geometry={trailGeo} material={trailMat} frustumCulled={false} />
      {/* 流星星体 ☆ */}
      <Text
        ref={emojiRef}
        position={[0, -9999, -300]}
        fontSize={7}
        anchorX="center"
        anchorY="middle"
        color="#ffffff"
        outlineWidth={0.5}
        outlineColor="#ffe8a0"
        fillOpacity={1}
      >
        ☆
      </Text>
    </>
  );
};

// 聚焦时相机平滑缩放效果
const CameraFocusEffect = ({ focused }: { focused: boolean }) => {
  const { camera } = useThree();
  const targetFov = useRef(75);
  useEffect(() => { targetFov.current = focused ? 42 : 75; }, [focused]);
  useFrame(() => {
    const cam = camera as THREE.PerspectiveCamera;
    if (Math.abs(cam.fov - targetFov.current) > 0.1) {
      cam.fov = THREE.MathUtils.lerp(cam.fov, targetFov.current, 0.05);
      cam.updateProjectionMatrix();
    }
  });
  return null;
};

// 视角控制 (单指转头 + 双指缩放 + 滚轮缩放)
const FlightController = () => {
  const { camera, gl } = useThree();

  // 累积旋转角（不回弹）
  const yaw   = useRef(0);
  const pitch = useRef(0);
  // 惯性速度（松手后平滑减速）
  const yawVel   = useRef(0);
  const pitchVel = useRef(0);

  const isDragging     = useRef(false);
  const lastTouch      = useRef({ x: 0, y: 0 });
  const lastPinchDist  = useRef(0);
  const targetFov      = useRef(75);

  // 鼠标拖拽（桌面端）
  const isMouseDown = useRef(false);
  const lastMouse   = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = gl.domElement;
    const SENS = 0.003;

    // ---- 触摸 ----
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isDragging.current = true;
        yawVel.current   = 0;
        pitchVel.current = 0;
        lastTouch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        isDragging.current = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastPinchDist.current = Math.sqrt(dx * dx + dy * dy);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1 && isDragging.current) {
        const dx = e.touches[0].clientX - lastTouch.current.x;
        const dy = e.touches[0].clientY - lastTouch.current.y;
        yaw.current   += dx * SENS;
        pitch.current -= dy * SENS;
        pitch.current  = THREE.MathUtils.clamp(pitch.current, -Math.PI / 3, Math.PI / 3);
        yawVel.current   = dx * SENS;
        pitchVel.current = -dy * SENS;
        lastTouch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        const dx   = e.touches[0].clientX - e.touches[1].clientX;
        const dy   = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        targetFov.current = THREE.MathUtils.clamp(
          targetFov.current + (lastPinchDist.current - dist) * 0.08,
          30, 110
        );
        lastPinchDist.current = dist;
      }
    };

    const onTouchEnd = () => { isDragging.current = false; };

    // ---- 鼠标（桌面端） ----
    const onMouseDown = (e: MouseEvent) => {
      isMouseDown.current = true;
      yawVel.current   = 0;
      pitchVel.current = 0;
      lastMouse.current = { x: e.clientX, y: e.clientY };
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isMouseDown.current) return;
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      yaw.current   += dx * SENS;
      pitch.current -= dy * SENS;
      pitch.current  = THREE.MathUtils.clamp(pitch.current, -Math.PI / 3, Math.PI / 3);
      yawVel.current   = dx * SENS;
      pitchVel.current = -dy * SENS;
      lastMouse.current = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = () => { isMouseDown.current = false; };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      targetFov.current = THREE.MathUtils.clamp(targetFov.current + e.deltaY * 0.04, 30, 110);
    };

    canvas.addEventListener('touchstart',  onTouchStart, { passive: false });
    canvas.addEventListener('touchmove',   onTouchMove,  { passive: false });
    canvas.addEventListener('touchend',    onTouchEnd,   { passive: false });
    canvas.addEventListener('mousedown',   onMouseDown);
    window.addEventListener('mousemove',   onMouseMove);
    window.addEventListener('mouseup',     onMouseUp);
    canvas.addEventListener('wheel',       onWheel, { passive: false });

    return () => {
      canvas.removeEventListener('touchstart',  onTouchStart);
      canvas.removeEventListener('touchmove',   onTouchMove);
      canvas.removeEventListener('touchend',    onTouchEnd);
      canvas.removeEventListener('mousedown',   onMouseDown);
      window.removeEventListener('mousemove',   onMouseMove);
      window.removeEventListener('mouseup',     onMouseUp);
      canvas.removeEventListener('wheel',       onWheel);
    };
  }, [gl]);

  useFrame(() => {
    // 松手后惯性衰减，不会弹回
    if (!isDragging.current && !isMouseDown.current) {
      yaw.current   += yawVel.current;
      pitch.current += pitchVel.current;
      pitch.current  = THREE.MathUtils.clamp(pitch.current, -Math.PI / 3, Math.PI / 3);
      yawVel.current   *= 0.88;
      pitchVel.current *= 0.88;
    }
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw.current;
    camera.rotation.x = pitch.current;

    const cam = camera as THREE.PerspectiveCamera;
    if (Math.abs(cam.fov - targetFov.current) > 0.01) {
      cam.fov = THREE.MathUtils.lerp(cam.fov, targetFov.current, 0.1);
      cam.updateProjectionMatrix();
    }
  });

  return null;
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'explore' | 'souls' | 'notes' | 'profile'>('explore');
  const [soulBook, setSoulBook] = useState<any>(null);
  const [soulLoading, setSoulLoading] = useState<any>(null);
  const [soulDialog, setSoulDialog] = useState<any>(null);
  const [focusedBookId, setFocusedBookId] = useState<string | null>(null);
  const [pausedBookId, setPausedBookId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [chatSessions, setChatSessions] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [booksData, setBooksData] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [visibleSlots, setVisibleSlots] = useState<any[]>([]);
  const [showDean, setShowDean] = useState(false);
  const [notesList, setNotesList] = useState<any[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [shareImage, setShareImage] = useState<{ dataUrl: string; noteId: number } | null>(null);
  const [shareGenerating, setShareGenerating] = useState<number | null>(null);
  const bookQueueRef = useRef<number[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  // ── 认证 & 访客状态 ──
  interface AuthUser { id: number; username: string; nickname: string | null; inviteCode?: string }
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [guestFingerprint, setGuestFingerprint] = useState<string>('');
  const [guestMsgCount, setGuestMsgCount] = useState(0);
  const [guestLimit, setGuestLimit] = useState(3);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginLimitReached, setLoginLimitReached] = useState(false);
  // 用户档案 (profile tab stats — fetched lazily)
  const [profileStats, setProfileStats] = useState<{ noteCount: number; totalScore: number; bookCount?: number; msgCount?: number } | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [nicknameEdit, setNicknameEdit] = useState('');
  const [nicknameEditing, setNicknameEditing] = useState(false);
  const [nicknameSaving, setNicknameSaving] = useState(false);
  const [showRules, setShowRules] = useState(false);

  // ── 灵魂段位 ──
  const SOUL_RANKS = [
    { min: 0,     max: 20,    title: '初入书院',  label: '蒙昧之心',   color: '#8ba5c8', icon: '📖', desc: '刚踏入太虚书院，尚未领悟先贤之道' },
    { min: 21,    max: 100,   title: '初窥门径',  label: '问道之心',   color: '#6dbfb8', icon: '🌿', desc: '开始与先贤对话，感受到思想的力量' },
    { min: 101,   max: 500,   title: '渐入佳境',  label: '求索之心',   color: '#7cb87f', icon: '🌱', desc: '思维逐渐开阔，能与先贤展开有深度的探讨' },
    { min: 501,   max: 1000,  title: '融会贯通',  label: '明澈之心',   color: '#c8a96e', icon: '✨', desc: '博览群书，初步领悟各家思想精髓' },
    { min: 1001,  max: 2000,  title: '博闻强识',  label: '慧识之心',   color: '#d4836e', icon: '🔥', desc: '深研典籍，能从容驾驭与多位先贤的对话' },
    { min: 2001,  max: 5000,  title: '通儒达道',  label: '贯通之心',   color: '#a78bfa', icon: '💫', desc: '融汇百家，在思想碰撞中形成独到见解' },
    { min: 5001,  max: 10000, title: '宗师境界',  label: '玄思之心',   color: '#f472b6', icon: '🌟', desc: '学问精深，与先贤平等对话，各有洞见' },
    { min: 10001, max: Infinity, title: '太虚先贤', label: '无上之心', color: '#ffd700', icon: '☀️', desc: '超凡入圣，堪称当世先贤，洞察古今大道' },
  ] as const;

  function getSoulRank(score: number) {
    return SOUL_RANKS.find(r => score >= r.min && score <= r.max) ?? SOUL_RANKS[0];
  }
  function getRankProgress(score: number) {
    const rank = getSoulRank(score);
    if (rank.max === Infinity) return 100;
    return Math.min(100, Math.round(((score - rank.min) / (rank.max - rank.min + 1)) * 100));
  }
  function getNextRank(score: number) {
    const idx = SOUL_RANKS.findIndex(r => score >= r.min && score <= r.max);
    return idx < SOUL_RANKS.length - 1 ? SOUL_RANKS[idx + 1] : null;
  }

  const VISIBLE_SLOTS = 15;

  // ── 认证初始化 ──
  useEffect(() => {
    // SSO 单点登录：从门户跳转过来时 URL 带 sso_token
    const _ssoParams = new URLSearchParams(window.location.search);
    const _ssoToken = _ssoParams.get('sso_token');
    const _ssoUser = _ssoParams.get('sso_user');
    if (_ssoToken && _ssoUser) {
      localStorage.setItem('txbt_token', _ssoToken);
      localStorage.setItem('txbt_user', _ssoUser);
      const clean = new URL(window.location.href);
      clean.searchParams.delete('sso_token');
      clean.searchParams.delete('sso_user');
      window.history.replaceState(null, '', clean.pathname + (clean.search || ''));
    }
    // 恢复已登录用户
    const token = localStorage.getItem('txbt_token');
    const userStr = localStorage.getItem('txbt_user');
    if (token && userStr) {
      try { setAuthUser(JSON.parse(userStr)); setAuthToken(token); } catch {}
    }
    // 生成/恢复访客指纹
    let fp = localStorage.getItem('txbt_fp');
    if (!fp) {
      fp = 'fp_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('txbt_fp', fp);
    }
    setGuestFingerprint(fp);
    // 处理邀请码：URL 带 ?code= 时记录访问，并保存到 localStorage 供注册时使用
    const urlCode = new URLSearchParams(window.location.search).get('code');
    if (urlCode) {
      // 仅当本次链接带了新的邀请码，才覆盖存储（避免二次访问清空）
      localStorage.setItem('txbt_invite', urlCode);
      // 上报访问记录（最佳努力）
      fetch('/api/h5/invite/visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: urlCode, fingerprint: fp }),
      }).catch(() => {});
      // 清除 URL 中的 code 参数，避免刷新重复上报
      const clean = new URL(window.location.href);
      clean.searchParams.delete('code');
      window.history.replaceState(null, '', clean.pathname + (clean.search || ''));
    }
    // 拉取访客限制
    fetch('/api/h5/guest/limit').then(r => r.json()).then(j => {
      if (j.code === 0) setGuestLimit(j.data.limit);
    }).catch(() => {});
    // 恢复访客计数（localStorage 快速估算）
    const saved = parseInt(localStorage.getItem('txbt_gc') || '0');
    if (!isNaN(saved)) setGuestMsgCount(saved);
  }, []);

  const handleAuthSuccess = useCallback((user: AuthUser, token: string) => {
    setAuthUser(user);
    setAuthToken(token);
    localStorage.setItem('txbt_token', token);
    localStorage.setItem('txbt_user', JSON.stringify(user));
    setShowLoginModal(false);
    setLoginLimitReached(false);
  }, []);

  const handleLogout = useCallback(() => {
    setAuthUser(null);
    setAuthToken(null);
    localStorage.removeItem('txbt_token');
    localStorage.removeItem('txbt_user');
    setProfileStats(null);
  }, []);

  // 访客每次发言后递增计数
  const handleGuestMessage = useCallback(() => {
    if (!authUser) {
      setGuestMsgCount(prev => {
        const next = prev + 1;
        localStorage.setItem('txbt_gc', String(next));
        return next;
      });
    }
  }, [authUser]);

  const handleGuestLimitReached = useCallback(() => {
    setLoginLimitReached(true);
    setShowLoginModal(true);
  }, []);

  const loadProfileStats = useCallback(async (token: string) => {
    setProfileLoading(true);
    try {
      const res = await fetch('/api/h5/user/stats', { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (json.code === 0) setProfileStats(json.data);
    } catch {}
    finally { setProfileLoading(false); }
  }, []);

  // 当前用户 ID 字符串（登录用 user_N，访客用指纹）
  const currentUserId = authUser ? `user_${authUser.id}` : guestFingerprint;

  // 从 API 加载书籍，加入 3D 定位数据
  useEffect(() => {
    fetch('/api/h5/books')
      .then(r => r.json())
      .then(json => {
        if (json.code === 0 && json.data) {
          const books = json.data.map((b: any, i: number) => ({
            id: `b_${b.id}`,
            dbId: b.id,
            title: `《${b.title}》`,
            author: b.author,
            era: b.era,
            soulColor: b.soulColor || '#ffd700',
            color: b.color || '#fff4d1',
            pos: generateBookPos(i),
            persona: b.persona,
            categories: (() => { try { return JSON.parse(b.categories || '[]'); } catch { return []; } })(),
          }));
          setBooksData(books);
        }
      })
      .catch(() => {});
  }, []);

  // 书籍轮播队列：打乱顺序，不重复直到所有书都浮现过
  const shuffleQueue = useCallback((books: any[]) => {
    const indices = Array.from({ length: books.length }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    bookQueueRef.current = indices;
  }, []);

  const pickNextBook = useCallback((books: any[]) => {
    if (books.length === 0) return null;
    if (bookQueueRef.current.length === 0) shuffleQueue(books);
    const idx = bookQueueRef.current.shift()!;
    return {
      ...books[idx],
      pos: new THREE.Vector3(
        (Math.random() - 0.5) * 260,
        (Math.random() - 0.5) * 160,
        -250 - Math.random() * 250
      ),
    };
  }, [shuffleQueue]);

  const filteredBooks = useMemo(() => {
    if (!selectedCategory) return booksData;
    return booksData.filter((b: any) => Array.isArray(b.categories) && b.categories.includes(selectedCategory));
  }, [booksData, selectedCategory]);

  const focusedBook = useMemo(
    () => booksData.find((b: any) => b.id === focusedBookId) || null,
    [focusedBookId, booksData]
  );

  // 书籍加载后初始化可视槽位（错开 z 位置依次浮现）
  useEffect(() => {
    if (booksData.length === 0) return;
    shuffleQueue(filteredBooks);
    const slots: any[] = [];
    const count = Math.min(VISIBLE_SLOTS, filteredBooks.length);
    for (let i = 0; i < count; i++) {
      const book = pickNextBook(filteredBooks);
      if (book) {
        book.pos = new THREE.Vector3(
          (Math.random() - 0.5) * 260,
          (Math.random() - 0.5) * 160,
          -40 - i * 75 - Math.random() * 35
        );
        slots.push(book);
      }
    }
    setVisibleSlots(slots);
  }, [filteredBooks]);

  // 书飞出屏幕后回收槽位，换下一本
  const handleBookRecycle = useCallback((slotIndex: number) => {
    const next = pickNextBook(filteredBooks);
    if (!next) return;
    setVisibleSlots(prev => {
      const updated = [...prev];
      updated[slotIndex] = next;
      return updated;
    });
  }, [filteredBooks, pickNextBook]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    const pool = selectedCategory ? filteredBooks : booksData;
    return pool.filter((b: any) =>
      b.title.toLowerCase().includes(q) ||
      b.author.toLowerCase().includes(q) ||
      b.era.toLowerCase().includes(q)
    ).slice(0, 6);
  }, [searchQuery, booksData, filteredBooks, selectedCategory]);

  const handleSelectCategory = useCallback((cat: string | null) => {
    setSelectedCategory(prev => prev === cat ? null : cat);
    setFocusedBookId(null);
    setSoulBook(null);
    setPausedBookId(null);
  }, []);

  const handleSearchInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setShowDropdown(true);
  }, []);

  const handleSelectBook = useCallback((book: any) => {
    setFocusedBookId(book.id);
    // 确保搜索选中的书在可视槽位中
    setVisibleSlots(prev => {
      if (prev.some(s => s.id === book.id)) return prev;
      const updated = [...prev];
      updated[0] = { ...book, pos: new THREE.Vector3(0, 0, -100) };
      return updated;
    });
    setSoulBook(null);
    setSearchQuery('');
    setShowDropdown(false);
    setActiveTab('explore');
  }, []);

  const handleClearFocus = useCallback(() => {
    setFocusedBookId(null);
    setSoulBook(null);
  }, []);

  const handleSoulDialog = useCallback((book: any, _pos: { x: number; y: number }, silent?: boolean) => {
    if (!silent) setSoulBook(book);
  }, []);

  const handleDismiss = useCallback(() => {
    setSoulBook(null);
    setFocusedBookId(null);
    setPausedBookId(null);
  }, []);

  const handlePause = useCallback((id: string | null) => {
    setPausedBookId(id);
    if (!id) setSoulBook(null);
  }, []);

  const handleEnterSoul = useCallback(() => {
    const target = focusedBook || soulBook;
    setSoulLoading(target);
    setSoulBook(null);
    setFocusedBookId(null);
    setPausedBookId(null);
  }, [focusedBook, soulBook]);

  const handleCloseSoul = useCallback(() => setSoulLoading(null), []);

  const handleEnterDialog = useCallback(() => {
    // 先显示 SoulDialog（会自带 fadeIn），保持 SoulLoading 作为底层
    setSoulDialog(soulLoading);
    // 延迟移除 SoulLoading，让过渡更平滑
    setTimeout(() => setSoulLoading(null), 600);
  }, [soulLoading]);

  const handleCloseDialog = useCallback(() => {
    setSoulDialog(null);
    setPausedBookId(null);
    setFocusedBookId(null);
  }, []);

  const handleSelectFromList = useCallback((book: any) => {
    setSoulLoading(book);
    setActiveTab('explore');
  }, []);

  const generateShareImage = useCallback(async (note: any) => {
    setShareGenerating(note.id);
    try {
      let highlights: { speaker: string; role: string; content: string }[] = [];
      try { highlights = JSON.parse(note.highlights || '[]'); } catch {}

      // 登录用户的真实显示名 + 段位
      const realName = authUser ? (authUser.nickname || authUser.username) : '读者';
      const userTotalScore = profileStats?.totalScore ?? 0;
      const SHARE_RANKS = [
        { min: 0,     max: 20,    title: '初入书院', color: '#8ba5c8', icon: '📖' },
        { min: 21,    max: 100,   title: '初窥门径', color: '#6dbfb8', icon: '🌿' },
        { min: 101,   max: 500,   title: '渐入佳境', color: '#7cb87f', icon: '🌱' },
        { min: 501,   max: 1000,  title: '融会贯通', color: '#c8a96e', icon: '✨' },
        { min: 1001,  max: 2000,  title: '博闻强识', color: '#d4836e', icon: '🔥' },
        { min: 2001,  max: 5000,  title: '通儒达道', color: '#a78bfa', icon: '💫' },
        { min: 5001,  max: 10000, title: '宗师境界', color: '#f472b6', icon: '🌟' },
        { min: 10001, max: Infinity, title: '太虚先贤', color: '#ffd700', icon: '☀️' },
      ];
      const userRankIdx = authUser
        ? Math.max(0, SHARE_RANKS.findIndex(r => userTotalScore >= r.min && userTotalScore <= r.max))
        : -1;
      const userRank = userRankIdx >= 0 ? SHARE_RANKS[userRankIdx] : null;

      if (!highlights.length) {
        highlights = [{ speaker: realName, role: 'user', content: note.summary }];
      }
      // 替换 highlights 中的「读者」为真实显示名
      if (authUser) {
        highlights = highlights.map(h =>
          h.role === 'user' ? { ...h, speaker: realName } : h
        );
      }

      // 查找作者信息
      const matchedBook = booksData.find((b: any) =>
        b.title === `《${note.bookTitle}》` || b.title === note.bookTitle
      );
      const authorName: string = matchedBook?.author
        || highlights.find(h => h.role === 'author' && h.speaker !== '先贤')?.speaker
        || note.bookTitle;
      const bookColor: string = matchedBook?.soulColor || '#8ec8f8';

      // 替换遗留"先贤"为真实作者名
      highlights = highlights.map(h =>
        h.role === 'author' && h.speaker === '先贤' ? { ...h, speaker: authorName } : h
      );

      const goldColor = '#c8a96e';
      const W = 900;
      // 卡片布局常量
      const OUTER_PAD = 44;          // 卡片到画布左右边
      const CARD_PAD_X = 28;         // 卡片内左右内边距
      const CARD_PAD_Y = 28;         // 卡片内上下内边距
      const ACCENT_W = 5;            // 左侧竖线宽度
      const ACCENT_GAP = 16;         // 竖线到文字距离
      const TEXT_LEFT = OUTER_PAD + CARD_PAD_X + ACCENT_W + ACCENT_GAP;
      const TEXT_RIGHT = W - OUTER_PAD - CARD_PAD_X;
      const TEXT_MAX_W = TEXT_RIGHT - TEXT_LEFT;
      const NAME_FONT_SIZE = 26;
      const ROLE_FONT_SIZE = 15;
      const BODY_FONT_SIZE = 20;
      const BODY_LINE_H = 36;
      const CARD_GAP = 24;           // 卡片间距

      // 量文字工具
      const measureCtx = document.createElement('canvas').getContext('2d')!;
      function wrapText(text: string, font: string, maxW: number): string[] {
        measureCtx.font = font;
        const lines: string[] = [];
        let cur = '';
        for (const ch of text.split('')) {
          if (measureCtx.measureText(cur + ch).width > maxW) { lines.push(cur); cur = ch; }
          else cur += ch;
        }
        if (cur) lines.push(cur);
        return lines;
      }

      const bodyFont = `${BODY_FONT_SIZE}px KaiTi, STKaiti, serif`;

      // 预计算每张卡片
      interface CardInfo {
        hl: { speaker: string; role: string; content: string };
        bodyLines: string[];
        cardH: number;
        accentColor: string;
        nameColor: string;
        tagLabel: string;
      }
      const cards: CardInfo[] = highlights.map(hl => {
        const isUser = hl.role === 'user';
        const bodyLines = wrapText(hl.content, bodyFont, TEXT_MAX_W);
        const authorSoulColor = (() => {
          if (isUser) return userRank ? userRank.color : '#5c82d4';
          const found = (booksData as any[]).find((b: any) => b.author === hl.speaker);
          return found?.soulColor || bookColor;
        })();
        const cardH = CARD_PAD_Y
          + NAME_FONT_SIZE + 8
          + ROLE_FONT_SIZE + 16
          + 1 + 12                   // 细分隔线
          + bodyLines.length * BODY_LINE_H
          + CARD_PAD_Y;
        return {
          hl,
          bodyLines,
          cardH,
          accentColor: isUser ? (userRank ? userRank.color : '#5c82d4') : authorSoulColor,
          nameColor: isUser ? (userRank ? userRank.color : 'rgba(160,190,255,0.92)') : goldColor,
          tagLabel: isUser ? '· 读者观点' : `· ${hl.speaker}先生观点`,
        };
      });

      const HEADER_H = 172;
      const FOOTER_H = 218;
      const cardsH = cards.reduce((s, c) => s + c.cardH + CARD_GAP, 0) - CARD_GAP;
      const H = HEADER_H + cardsH + 48 + FOOTER_H;

      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d')!;

      // ── 背景渐变 ──
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#00040e'); bg.addColorStop(0.45, '#010918'); bg.addColorStop(1, '#00040e');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      // 星点背景
      const rng = (() => { let s = 99; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; })();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      for (let i = 0; i < 130; i++) {
        ctx.beginPath(); ctx.arc(rng() * W, rng() * H, rng() * 1.1 + 0.2, 0, Math.PI * 2); ctx.fill();
      }

      const drawHRule = (y: number, alpha: number) => {
        ctx.save();
        ctx.strokeStyle = `rgba(200,169,110,${alpha})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(44, y); ctx.lineTo(W - 44, y); ctx.stroke();
        ctx.restore();
      };

      // ── 标题区 ──
      drawHRule(64, 0.35); drawHRule(68, 0.12);

      ctx.font = 'bold 38px KaiTi, STKaiti, serif';
      ctx.fillStyle = goldColor; ctx.textAlign = 'center';
      ctx.shadowColor = `${goldColor}88`; ctx.shadowBlur = 18;
      ctx.fillText(`${note.bookTitle}`, W / 2, 46); ctx.shadowBlur = 0;

      ctx.font = '19px KaiTi, STKaiti, serif';
      ctx.fillStyle = goldColor;
      ctx.fillText('别去书中寻找答案，去与灵魂对话', W / 2, 90);

      const stars = Array.from({ length: 5 }, (_, i) => i < (note.score || 3) ? '★' : '☆').join('  ');
      ctx.font = '19px serif'; ctx.fillStyle = goldColor;
      ctx.fillText(stars, W / 2, 130);

      drawHRule(HEADER_H - 12, 0.10);

      // ── 观点卡片 ──
      let curY = HEADER_H + 16;

      for (const { hl, bodyLines, cardH, accentColor, nameColor, tagLabel } of cards) {
        const isUser = hl.role === 'user';
        const cardX = OUTER_PAD;
        const cardW = W - OUTER_PAD * 2;
        const cardR = 14;

        // 卡片底色 + 圆角
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cardX + cardR, curY);
        ctx.lineTo(cardX + cardW - cardR, curY);
        ctx.arcTo(cardX + cardW, curY, cardX + cardW, curY + cardR, cardR);
        ctx.lineTo(cardX + cardW, curY + cardH - cardR);
        ctx.arcTo(cardX + cardW, curY + cardH, cardX + cardW - cardR, curY + cardH, cardR);
        ctx.lineTo(cardX + cardR, curY + cardH);
        ctx.arcTo(cardX, curY + cardH, cardX, curY + cardH - cardR, cardR);
        ctx.lineTo(cardX, curY + cardR);
        ctx.arcTo(cardX, curY, cardX + cardR, curY, cardR);
        ctx.closePath();
        ctx.fillStyle = isUser ? 'rgba(14,24,58,0.72)' : 'rgba(10,16,38,0.80)';
        ctx.fill();
        ctx.strokeStyle = isUser ? 'rgba(80,110,200,0.20)' : `${accentColor}28`;
        ctx.lineWidth = 1; ctx.stroke();
        ctx.restore();

        // 左侧竖线 accent（渐变）
        const accentX = cardX + CARD_PAD_X;
        const accentTop = curY + CARD_PAD_Y;
        const accentBot = curY + cardH - CARD_PAD_Y;
        ctx.save();
        const accentGrad = ctx.createLinearGradient(0, accentTop, 0, accentBot);
        accentGrad.addColorStop(0, accentColor + 'ff');
        accentGrad.addColorStop(1, accentColor + '22');
        ctx.fillStyle = accentGrad;
        ctx.beginPath();
        ctx.roundRect(accentX, accentTop, ACCENT_W, accentBot - accentTop, 3);
        ctx.fill();
        ctx.restore();

        const textX = TEXT_LEFT;
        let ty = curY + CARD_PAD_Y;

        // —— 头像框（左侧，与名字行对齐）——
        const SAVATAR_R = 22;  // polygon outer radius
        const SINNER_R = 13;   // avatar circle radius
        const avatarCX = textX + SAVATAR_R;
        const avatarCY = ty + SAVATAR_R;
        const nameX = textX + SAVATAR_R * 2 + 14;  // text starts right of avatar
        const siPt = (deg: number, r: number): [number, number] => {
          const a = (deg - 90) * Math.PI / 180;
          return [avatarCX + r * Math.cos(a), avatarCY + r * Math.sin(a)];
        };

        if (isUser && userRank) {
          // 用户：段位多边形框
          const ari = userRankIdx;
          const arc = userRank.color;
          const R = SAVATAR_R;
          const shapePts: [number, number][] =
            ari === 0 ? [siPt(0,R), siPt(90,R*0.74), siPt(180,R), siPt(270,R*0.74)]
            : ari === 1 ? Array.from({length:5}, (_,i) => siPt(i*72, R))
            : ari === 2 ? Array.from({length:6}, (_,i) => siPt(i*60, R))
            : ari === 3 ? Array.from({length:8}, (_,i) => siPt(i*45, i%2===0 ? R : R*0.84))
            : ari === 4 ? Array.from({length:16}, (_,i) => siPt(i*22.5, i%2===0 ? R : R*0.7))
            : ari === 5 ? Array.from({length:24}, (_,i) => siPt(i*15, i%2===0 ? R : R*0.725))
            : ari === 6 ? Array.from({length:32}, (_,i) => siPt(i*11.25, i%2===0 ? R : R*0.6))
            : Array.from({length:48}, (_,i) => siPt(i*7.5, i%2===0 ? R : R*0.5));
          ctx.beginPath();
          shapePts.forEach(([x,y],i) => i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y));
          ctx.closePath();
          ctx.fillStyle = arc + '22'; ctx.fill();
          ctx.save();
          ctx.shadowColor = arc; ctx.shadowBlur = 5;
          ctx.strokeStyle = arc; ctx.lineWidth = 1.8; ctx.stroke();
          ctx.restore();
          const spikes = [4,5,6,8,8,12,16,24][ari] ?? 8;
          const dotR2 = spikes <= 6 ? 2.0 : spikes <= 12 ? 1.5 : 1.0;
          ctx.fillStyle = arc;
          for (let i = 0; i < spikes; i++) {
            const [dx, dy] = siPt(i * (360 / spikes), R - 0.5);
            ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(dx, dy, dotR2, 0, Math.PI*2); ctx.fill();
          }
          ctx.globalAlpha = 1;
        } else {
          // 作者：简单光晕圆圈
          ctx.save();
          ctx.shadowColor = accentColor; ctx.shadowBlur = 8;
          ctx.strokeStyle = accentColor + 'aa'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(avatarCX, avatarCY, SAVATAR_R - 1, 0, Math.PI*2); ctx.stroke();
          ctx.restore();
          ctx.fillStyle = accentColor + '15';
          ctx.beginPath(); ctx.arc(avatarCX, avatarCY, SAVATAR_R - 1, 0, Math.PI*2); ctx.fill();
        }

        // 头像内字母
        const avatarLetter = isUser ? realName.slice(0,1).toUpperCase() : hl.speaker.slice(-1);
        ctx.save();
        ctx.beginPath(); ctx.arc(avatarCX, avatarCY, SINNER_R, 0, Math.PI*2);
        ctx.fillStyle = (isUser && userRank ? userRank.color : accentColor) + '22'; ctx.fill();
        ctx.font = 'bold 14px KaiTi, STKaiti, serif';
        ctx.fillStyle = isUser ? '#c8d8ff' : '#fffbe8';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = accentColor; ctx.shadowBlur = 5;
        ctx.fillText(avatarLetter, avatarCX, avatarCY);
        ctx.restore();

        // 段位小徽章（右下角）
        if (isUser && userRank) {
          const bx = avatarCX + SINNER_R * 0.76; const by = avatarCY + SINNER_R * 0.76;
          ctx.save();
          ctx.beginPath(); ctx.arc(bx, by, 7, 0, Math.PI*2);
          ctx.fillStyle = '#000c20'; ctx.fill();
          ctx.strokeStyle = userRank.color + '66'; ctx.lineWidth = 1; ctx.stroke();
          ctx.font = '9px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(userRank.icon, bx, by);
          ctx.restore();
        }

        // 名字
        ctx.font = `bold ${NAME_FONT_SIZE}px KaiTi, STKaiti, serif`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = nameColor;
        ctx.shadowColor = accentColor + '55'; ctx.shadowBlur = 8;
        ctx.fillText(hl.speaker, nameX, ty + NAME_FONT_SIZE - 2);
        ctx.shadowBlur = 0;
        // 用户：段位 icon + 名称内联在名字后面
        if (isUser && userRank) {
          measureCtx.font = `bold ${NAME_FONT_SIZE}px KaiTi, STKaiti, serif`;
          const nw = measureCtx.measureText(hl.speaker).width;
          ctx.save();
          ctx.font = '17px serif';
          ctx.fillStyle = userRank.color;
          ctx.fillText(userRank.icon, nameX + nw + 8, ty + NAME_FONT_SIZE - 2);
          ctx.font = `bold 15px KaiTi, STKaiti, serif`;
          ctx.shadowColor = userRank.color + '55'; ctx.shadowBlur = 6;
          ctx.fillText(userRank.title, nameX + nw + 30, ty + NAME_FONT_SIZE - 2);
          ctx.restore();
        }
        ty += NAME_FONT_SIZE + 8;

        // 角色小标签
        ctx.font = `${ROLE_FONT_SIZE}px KaiTi, STKaiti, serif`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = isUser ? 'rgba(100,140,210,0.45)' : `${accentColor}66`;
        ctx.fillText(tagLabel, nameX, ty + ROLE_FONT_SIZE - 2);
        ty += ROLE_FONT_SIZE + 16;

        // 内部细分隔线
        ctx.save();
        ctx.strokeStyle = accentColor + '20'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(textX, ty - 6);
        ctx.lineTo(cardX + cardW - CARD_PAD_X, ty - 6);
        ctx.stroke();
        ctx.restore();
        ty += 12;

        // 正文
        ctx.font = bodyFont;
        ctx.fillStyle = isUser ? 'rgba(190,210,255,0.82)' : 'rgba(225,235,215,0.80)';
        ctx.textAlign = 'left';
        for (const line of bodyLines) {
          ctx.fillText(line, textX, ty + BODY_FONT_SIZE);
          ty += BODY_LINE_H;
        }

        curY += cardH + CARD_GAP;
      }

      // ── 底部 Footer ──
      const footerTop = curY + 10;
      drawHRule(footerTop, 0.14);

      const inviteCode = authUser?.inviteCode;
      const qrUrl = inviteCode
        ? `https://txsy.pinyanzhi.net?code=${inviteCode}`
        : 'https://txsy.pinyanzhi.net';
      const qrDataUrl = await QRCode.toDataURL(qrUrl, {
        width: 110, margin: 1,
        color: { dark: '#c8a96e', light: '#000c22' },
      });
      const qrImg = new Image();
      await new Promise<void>(resolve => { qrImg.onload = () => resolve(); qrImg.src = qrDataUrl; });
      const qrSize = 110;

      // 右侧：二维码区域
      const qrX = W - OUTER_PAD - qrSize;   // 右对齐
      const qrY = footerTop + 28;
      ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

      ctx.textAlign = 'center';
      const qrCX = qrX + qrSize / 2;
      ctx.font = '14px KaiTi, STKaiti, serif';
      ctx.fillStyle = 'rgba(200,169,110,0.70)';
      ctx.fillText('扫码加入', qrCX, qrY + qrSize + 22);
      ctx.font = '12px monospace';
      ctx.fillStyle = 'rgba(150,170,210,0.58)';
      ctx.fillText('txsy.pinyanzhi.net', qrCX, qrY + qrSize + 42);

      // 左侧：宣传语
      const SHARE_SLOGANS = [
        '以对话叩问古今',
        '太虚之内，必有回响',
        '与先贤同坐，共论千秋',
        '书卷未尽，灵魂犹在',
        '一问一答，字字皆道',
      ];
      const slogan = SHARE_SLOGANS[Math.floor(Math.random() * SHARE_SLOGANS.length)];
      const sloganX = OUTER_PAD + 20;
      ctx.textAlign = 'left';
      ctx.font = 'bold 28px KaiTi, STKaiti, serif';
      ctx.fillStyle = goldColor;
      ctx.shadowColor = goldColor + '88'; ctx.shadowBlur = 16;
      ctx.fillText(slogan, sloganX, footerTop + 72);
      ctx.shadowBlur = 0;

      ctx.font = '14px KaiTi, STKaiti, serif';
      ctx.fillStyle = 'rgba(200,169,110,0.28)';
      ctx.fillText('── 太虚书院 ──', sloganX, footerTop + 158);

      setShareImage({ dataUrl: canvas.toDataURL('image/png'), noteId: note.id });
    } finally {
      setShareGenerating(null);
    }
  }, [booksData, authUser, profileStats]);

  return (
    <div style={{ width: '100vw', height: '100dvh', overflow: 'hidden', position: 'relative', background: 'black' }}>
      {/* 主场景 */}
      <Canvas
        style={{ display: activeTab === 'explore' ? 'block' : 'none' }}
        camera={{ position: [0, 0, 0], fov: 75, near: 0.1, far: 1000, rotation: [0, 0, 0] }}
        gl={{ antialias: true }}
        onPointerMissed={() => { if (!soulLoading) handleDismiss(); }}
      >
        <color attach="background" args={['#00030a']} />
        <ambientLight intensity={0.1} />
        <pointLight position={[10, 20, 15]} intensity={1.8} color="#f5e2a9" />
        <directionalLight position={[-10, -10, -5]} intensity={0.3} color="#aaccee" />
        <BackgroundStars />
        <MilkyWay />
        <TwinklingStars />
        {visibleSlots.map((book: any, index: number) => (
          <FlyingBook
            key={`slot_${index}_${book.id}`} data={book}
            slotIndex={index}
            onRecycle={handleBookRecycle}
            onSoulDialog={handleSoulDialog}
            onDismiss={handleDismiss}
            isFocused={book.id === focusedBookId}
            pausedBookId={pausedBookId}
            onPause={handlePause}
          />
        ))}
        {Array.from({ length: METEORS_COUNT }).map((_, i) => <SingleMeteor key={i} />)}
        <CameraFocusEffect focused={!!focusedBookId} />
        <FlightController />
      </Canvas>

      {/* 顶部标题 */}
      {activeTab === 'explore' && (
        <div style={{
          position: 'absolute', top: 0, width: '100%', textAlign: 'center',
          pointerEvents: 'none', padding: '44px 0 20px',
          background: 'linear-gradient(180deg, rgba(0,3,12,0.75) 0%, rgba(0,3,12,0.4) 70%, transparent 100%)',
        }}>
          <h1 style={{
            fontFamily: "'Zhi Mang Xing', 'STXingKai', 'KaiTi', serif",
            fontSize: '2.4rem', margin: '0 0 6px 0', letterSpacing: '10px', color: '#f0f6ff',
            textShadow: '0 0 12px rgba(180,220,255,1), 0 0 30px rgba(100,170,255,0.7), 0 0 60px rgba(60,120,255,0.35), 2px 3px 0px rgba(0,0,0,0.9)',
          }}>太虚书院</h1>
          <p style={{ fontSize: '0.7rem', margin: 0, color: 'rgba(180,210,255,0.55)', textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>
            单指转头 &nbsp;|&nbsp; 双指缩放 &nbsp;|&nbsp; 点击星球暂停
          </p>
        </div>
      )}

      {/* 搜索框 + 分类筛选（中上部，默认展开） */}
      {activeTab === 'explore' && (
        <div style={{
          position: 'absolute', top: '100px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 6000, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
          pointerEvents: 'none',
        }}>
          {/* 搜索框 */}
          <div style={{ position: 'relative', pointerEvents: 'auto' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: 'rgba(6,12,36,0.82)', border: '1px solid rgba(100,160,255,0.35)',
              borderRadius: '22px', padding: '7px 14px', backdropFilter: 'blur(14px)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.55)', width: '240px',
            }}>
              <span style={{ color: 'rgba(120,180,255,0.7)', fontSize: '0.85rem', flexShrink: 0 }}>🔍</span>
              <input
                ref={searchRef}
                value={searchQuery}
                onChange={handleSearchInput}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                placeholder="搜索书名或作者…"
                style={{
                  background: 'transparent', border: 'none', outline: 'none',
                  color: '#eaf4ff', fontSize: '0.82rem', width: '100%',
                  fontFamily: '"KaiTi", "STKaiti", serif', letterSpacing: '1px', caretColor: '#7dd3fc',
                }}
              />
              {searchQuery && (
                <span onClick={() => { setSearchQuery(''); setShowDropdown(false); }}
                  style={{ color: 'rgba(160,180,220,0.5)', cursor: 'pointer', fontSize: '0.9rem', flexShrink: 0 }}>✕</span>
              )}
            </div>
            {showDropdown && searchResults.length > 0 && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)',
                width: '240px', zIndex: 10,
                background: 'rgba(6,12,36,0.97)', border: '1px solid rgba(80,130,220,0.25)',
                borderRadius: '12px', backdropFilter: 'blur(16px)', boxShadow: '0 8px 30px rgba(0,0,0,0.7)',
                overflow: 'hidden',
              }}>
                {searchResults.map((book: any) => (
                  <div key={book.id} onClick={() => handleSelectBook(book)}
                    style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(80,120,200,0.1)', fontFamily: '"KaiTi", "STKaiti", serif' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(60,100,200,0.2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ color: book.soulColor, fontSize: '0.9rem', letterSpacing: '1px', textShadow: `0 0 8px ${book.soulColor}50` }}>{book.title}</div>
                    <div style={{ color: 'rgba(160,190,230,0.55)', fontSize: '0.7rem', marginTop: '2px' }}>{book.author} · {book.era}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 分类筛选 — 纯文本 | 分隔 */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0',
            pointerEvents: 'auto', whiteSpace: 'nowrap',
          }}>
            {(['古籍', '政治', '军事', '文学', '管理', '财务', '成长', '其他'] as const).map((cat, i, arr) => {
              const active = selectedCategory === cat;
              return (
                <React.Fragment key={cat}>
                  <span
                    onClick={() => handleSelectCategory(cat)}
                    style={{
                      fontSize: '0.72rem',
                      fontFamily: '"KaiTi", "STKaiti", serif',
                      letterSpacing: '1px',
                      cursor: 'pointer',
                      color: active ? '#c8e8ff' : 'rgba(200,230,255,0.78)',
                      textShadow: active ? '0 0 8px rgba(100,180,255,0.7)' : 'none',
                      fontWeight: active ? 'bold' : 'normal',
                      transition: 'color 0.15s',
                      padding: '2px 6px',
                    }}
                  >{cat}</span>
                  {i < arr.length - 1 && (
                    <span style={{ color: 'rgba(100,140,200,0.25)', fontSize: '0.65rem', userSelect: 'none' }}>|</span>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* 灵魂对话面板 — 固定底部中央弹出卡片 */}
      {(focusedBook || soulBook) && activeTab === 'explore' && (() => {
        const target = focusedBook || soulBook;
        const onDismissCard = focusedBook ? handleClearFocus : handleDismiss;
        return (
          <div style={{
            position: 'fixed', bottom: '72px', left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 5000,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
            padding: '16px 28px 18px',
            background: 'rgba(4,8,24,0.90)',
            border: `1px solid ${target.soulColor}45`,
            borderRadius: '20px',
            backdropFilter: 'blur(20px)',
            boxShadow: `0 6px 40px rgba(0,0,0,0.75), 0 0 24px ${target.soulColor}18`,
            minWidth: '230px', maxWidth: '88vw',
            animation: 'soulCardUp 0.22s ease',
            fontFamily: '"KaiTi", "STKaiti", serif',
          }}>
            {/* 右上角关闭 */}
            <div
              onClick={onDismissCard}
              style={{
                position: 'absolute', top: '8px', right: '12px',
                color: 'rgba(200,220,255,0.35)', fontSize: '0.7rem', cursor: 'pointer',
                lineHeight: 1, padding: '2px 4px',
              }}
            >✕</div>
            {/* 书名 */}
            <div style={{
              color: target.soulColor, fontSize: '1.05rem', letterSpacing: '3px',
              textShadow: `0 0 14px ${target.soulColor}70`, textAlign: 'center',
            }}>{target.title}</div>
            {/* 作者·时代 */}
            <div style={{
              color: 'rgba(210,230,255,0.72)', fontSize: '0.72rem',
              letterSpacing: '2px', marginTop: '-4px',
            }}>{target.author} · {target.era}</div>
            {/* 按钮行 */}
            <div style={{ marginTop: '2px' }}>
              <div
                onClick={handleEnterSoul}
                style={{
                  padding: '8px 32px', borderRadius: '24px',
                  background: `linear-gradient(135deg, ${target.soulColor}40, ${target.soulColor}1a)`,
                  border: `1px solid ${target.soulColor}70`,
                  color: target.soulColor, fontSize: '0.95rem', letterSpacing: '4px',
                  cursor: 'pointer', backdropFilter: 'blur(4px)',
                  boxShadow: `0 0 14px ${target.soulColor}25`,
                }}
              >灵魂对话</div>
            </div>
          </div>
        );
      })()}

      {/* ===== 灵魂降临页面（聊天记录列表） ===== */}
      {activeTab === 'souls' && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, #000510 0%, #020a1a 50%, #000510 100%)',
          overflowY: 'auto',
          fontFamily: '"KaiTi", "STKaiti", serif',
          display: 'flex', flexDirection: 'column',
          paddingBottom: 'calc(60px + env(safe-area-inset-bottom))',
        }}>
          {/* 标题栏 */}
          <div style={{
            padding: '20px 20px 12px',
            borderBottom: '1px solid rgba(200,169,110,0.15)',
            flexShrink: 0,
          }}>
            <div style={{ color: '#c8a96e', fontSize: '1.15rem', letterSpacing: '5px', textShadow: '0 0 14px #c8a96e90' }}>
              太虚问道
            </div>
            <div style={{ color: 'rgba(150,170,210,0.4)', fontSize: '0.65rem', letterSpacing: '2px', marginTop: '4px' }}>
              与先贤对弈的记忆
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 0' }}>

          {chatSessions.length === 0 ? (
            <div style={{ textAlign: 'center', marginTop: '60px' }}>
              <div style={{ fontSize: '3rem', color: 'rgba(255,255,255,0.08)', marginBottom: '20px' }}>☯</div>
              <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.9rem', letterSpacing: '4px', marginBottom: '10px' }}>尚无对弈记录</div>
              <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.72rem', lineHeight: 1.8 }}>
                在「神游太虚」中点击书籍<br/>开启灵魂对弈，记录将出现在此
              </div>
            </div>
          ) : (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: '12px',
              maxWidth: '500px', margin: '0 auto',
            }}>
              {chatSessions.map((s: any) => {
                const isDean = s.sessionId === '__dean__' || s.sessionId.startsWith('__dean__');
                const bookData = !isDean && booksData.find(
                  (b: any) => b.title.replace(/《|》/g, '') === s.sessionId || b.title === s.sessionId
                );
                const sc = isDean ? '#c8a96e' : (bookData?.soulColor || '#8ec8f8');
                const author = isDean ? '' : (bookData?.author || '');
                const era = isDean ? '' : (bookData?.era || '');
                const lastTime = new Date(s.lastChatAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                return (
                  <div
                    key={s.sessionId}
                    onClick={() => {
                      if (isDean) { setShowDean(true); return; }
                      const target = bookData || { id: s.sessionId, title: `《${s.sessionId}》`, author: s.sessionId, era: '', soulColor: '#8ec8f8' };
                      handleSelectFromList(target);
                    }}
                    style={{
                      padding: '14px 16px', borderRadius: '12px',
                      background: `linear-gradient(135deg, ${sc}10, rgba(8,14,42,0.6))`,
                      border: `1px solid ${sc}22`,
                      cursor: 'pointer', transition: 'all 0.3s',
                      display: 'flex', alignItems: 'center', gap: '14px',
                    }}
                  >
                    <div style={{
                      width: '42px', height: '42px', borderRadius: '50%', flexShrink: 0,
                      background: `radial-gradient(circle at 40% 35%, ${sc}70, ${sc}20)`,
                      border: `1px solid ${sc}50`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fffbe8', fontSize: '1rem',
                      boxShadow: `0 0 12px ${sc}30`,
                    }}>
                      {isDean ? '📜' : (author.slice(-1) || '☯')}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: sc, fontSize: '0.95rem', letterSpacing: '2px', textShadow: `0 0 8px ${sc}40` }}>
                        {isDean ? '太虚书院 · 院长' : `《${s.sessionId}》`}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', marginTop: '3px' }}>
                        {isDean ? `太虚书院守护者 · ${s.msgCount}条对话` : `${author}${era ? ` · ${era}` : ''} · ${s.msgCount}条对话`}
                      </div>
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.62rem', flexShrink: 0 }}>
                      {lastTime}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </div>
        </div>
      )}

      {/* ===== 太虚笔谈页面 ===== */}
      {activeTab === 'notes' && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, #000510 0%, #020a1a 50%, #000510 100%)',
          fontFamily: '"KaiTi", "STKaiti", serif',
          display: 'flex', flexDirection: 'column',
          paddingBottom: 'calc(60px + env(safe-area-inset-bottom))',
        }}>
          {/* 标题栏 */}
          <div style={{
            padding: '20px 20px 12px',
            borderBottom: '1px solid rgba(200,169,110,0.15)',
            flexShrink: 0,
          }}>
            <div style={{ color: '#c8a96e', fontSize: '1.15rem', letterSpacing: '5px', textShadow: '0 0 14px #c8a96e90' }}>
              太虚笔谈
            </div>
            <div style={{ color: 'rgba(150,170,210,0.4)', fontSize: '0.65rem', letterSpacing: '2px', marginTop: '4px' }}>
              每一次灵魂交流的印记
            </div>
          </div>

          {/* 笔谈列表 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 0', scrollbarWidth: 'thin', scrollbarColor: '#c8a96e30 transparent' }}>
            {notesLoading ? (
              <div style={{ textAlign: 'center', color: 'rgba(200,169,110,0.4)', fontSize: '0.8rem', paddingTop: '60px', letterSpacing: '3px' }}>
                墨迹显现中…
              </div>
            ) : notesList.length === 0 ? (
              <div style={{ textAlign: 'center', paddingTop: '80px' }}>
                <div style={{ fontSize: '2rem', color: 'rgba(255,255,255,0.1)', marginBottom: '12px' }}>✍</div>
                <div style={{ color: 'rgba(200,169,110,0.4)', fontSize: '0.8rem', letterSpacing: '4px' }}>尚无笔谈记录</div>
                <div style={{ color: 'rgba(140,160,200,0.3)', fontSize: '0.65rem', marginTop: '8px', letterSpacing: '1px' }}>
                  在灵魂对弈中生成笔谈，记录你的思想印记
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '20px' }}>
                {notesList.map((note: any) => (
                  <div key={note.id} style={{
                    background: 'linear-gradient(135deg, rgba(200,169,110,0.08), rgba(0,0,0,0.4))',
                    border: '1px solid rgba(200,169,110,0.18)',
                    borderRadius: '12px', padding: '16px',
                    position: 'relative',
                  }}>
                    {/* 顶部：书名 + 评分 + 删除 */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ color: '#c8a96e', fontSize: '0.8rem', letterSpacing: '2px' }}>
                        {note.bookTitle}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ display: 'flex', gap: '2px' }}>
                          {[1,2,3,4,5].map(s => (
                            <span key={s} style={{
                              fontSize: '0.75rem',
                              color: s <= note.score ? '#c8a96e' : 'rgba(200,169,110,0.2)',
                            }}>★</span>
                          ))}
                        </div>
                        <span
                          onClick={() => generateShareImage(note)}
                          style={{
                            cursor: shareGenerating === note.id ? 'wait' : 'pointer',
                            color: 'rgba(200,169,110,0.45)', fontSize: '0.7rem',
                            padding: '2px 6px', borderRadius: '4px',
                            border: '1px solid rgba(200,169,110,0.2)',
                            transition: 'all 0.2s',
                          }}
                          onMouseEnter={e => { (e.currentTarget.style.color = 'rgba(200,169,110,0.9)'); (e.currentTarget.style.borderColor = 'rgba(200,169,110,0.5)'); }}
                          onMouseLeave={e => { (e.currentTarget.style.color = 'rgba(200,169,110,0.45)'); (e.currentTarget.style.borderColor = 'rgba(200,169,110,0.2)'); }}
                          title="生成分享图"
                        >{shareGenerating === note.id ? '打开中…' : '分享'}</span>
                        <span
                          onClick={() => {
                            if (!confirm('确定删除这份笔谈？')) return;
                            fetch(`/api/h5/notes/${note.id}`, { method: 'DELETE' })
                              .then(r => r.json())
                              .then(j => { if (j.code === 0) setNotesList(prev => prev.filter((n: any) => n.id !== note.id)); })
                              .catch(() => {});
                          }}
                          style={{
                            cursor: 'pointer', color: 'rgba(200,80,80,0.4)', fontSize: '0.7rem',
                            padding: '2px 4px', borderRadius: '4px',
                            transition: 'color 0.2s',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,100,100,0.75)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(200,80,80,0.4)')}
                          title="删除笔谈"
                        >✕</span>
                      </div>
                    </div>
                    {/* 笔谈内容 */}
                    <div style={{
                      color: 'rgba(185,205,240,0.75)', fontSize: '0.78rem',
                      lineHeight: '1.9', letterSpacing: '0.5px',
                    }}>
                      {note.summary}
                    </div>
                    {/* 时间 */}
                    <div style={{ color: 'rgba(150,170,210,0.3)', fontSize: '0.62rem', marginTop: '10px', textAlign: 'right' }}>
                      {new Date(note.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== 分享图预览弹窗 ===== */}
      {shareImage && (
        <div
          onClick={() => setShareImage(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 30000,
            background: 'rgba(0,4,16,0.92)', backdropFilter: 'blur(10px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '0',
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: '480px', display: 'flex', flexDirection: 'column',
            height: '100%', overflow: 'hidden',
          }}>
            {/* 可滚动的预览图区域 */}
            <div style={{
              flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
              padding: '16px 16px 0',
            }}>
              <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(200,169,110,0.25)', boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}>
                <img src={shareImage.dataUrl} alt="分享图" style={{ width: '100%', display: 'block' }} />
              </div>
            </div>
            {/* 固定在底部的操作按钮 */}
            <div style={{
              flexShrink: 0, padding: '12px 16px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
              background: 'linear-gradient(0deg, rgba(0,4,16,0.98) 60%, rgba(0,4,16,0) 100%)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
            }}>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                <a
                  href={shareImage.dataUrl}
                  download={`太虚书院-笔谈-${shareImage.noteId}.png`}
                  style={{
                    padding: '10px 28px', borderRadius: '24px',
                    background: 'linear-gradient(135deg, #c8a96ecc, #c8a96e88)',
                    color: '#fff', fontSize: '0.82rem', letterSpacing: '2px',
                    textDecoration: 'none', fontFamily: '"KaiTi","STKaiti",serif',
                    boxShadow: '0 0 18px rgba(200,169,110,0.35)',
                  }}
                >保存图片</a>
                <button
                  onClick={() => setShareImage(null)}
                  style={{
                    padding: '10px 24px', borderRadius: '24px',
                    background: 'rgba(30,45,80,0.6)', border: '1px solid rgba(80,110,180,0.35)',
                    color: 'rgba(180,200,240,0.7)', fontSize: '0.82rem',
                    cursor: 'pointer', letterSpacing: '2px',
                    fontFamily: '"KaiTi","STKaiti",serif',
                  }}
                >关闭</button>
              </div>
              <div style={{ textAlign: 'center', color: 'rgba(150,170,210,0.3)', fontSize: '0.62rem' }}>
                长按图片也可保存到相册
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== 灵犀 · 个人主页 ===== */}
      {activeTab === 'profile' && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, #000510 0%, #020a1a 60%, #000510 100%)',
          fontFamily: '"KaiTi", "STKaiti", serif',
          display: 'flex', flexDirection: 'column',
          paddingBottom: 'calc(60px + env(safe-area-inset-bottom))',
          overflowY: 'auto',
        }}>
          {/* 标题栏 */}
          <div style={{
            padding: '20px 20px 12px',
            borderBottom: '1px solid rgba(200,169,110,0.15)',
            flexShrink: 0,
          }}>
            <div style={{ color: '#c8a96e', fontSize: '1.15rem', letterSpacing: '5px', textShadow: '0 0 14px #c8a96e90' }}>
              灵　犀
            </div>
            <div style={{ color: 'rgba(150,170,210,0.4)', fontSize: '0.65rem', letterSpacing: '2px', marginTop: '4px' }}>
              心有灵犀一点通
            </div>
          </div>

          <div style={{ flex: 1, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {authUser ? (
              <>
                {/* 用户信息卡 */}
                {(() => {
                  const rank = profileStats ? getSoulRank(profileStats.totalScore) : null;
                  const progress = profileStats ? getRankProgress(profileStats.totalScore) : 0;
                  const next = profileStats ? getNextRank(profileStats.totalScore) : null;
                  const rc = rank?.color ?? '#5c82d4';
                  // Per-rank distinct polygon shapes for the avatar frame
                  const cx = 44; const cy = 44;
                  function polyPt(angleDeg: number, r: number) {
                    const a = (angleDeg - 90) * Math.PI / 180;
                    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
                  }
                  const rankIdx = rank ? SOUL_RANKS.findIndex(rv => rv.title === rank.title) : 0;
                  // Rank 0: diamond (4pt) → Rank 7: 24-point ornate star
                  const rankShapes: (() => string)[] = [
                    () => [polyPt(0,38), polyPt(90,28), polyPt(180,38), polyPt(270,28)].join(' '), // 0 diamond
                    () => Array.from({length:5},(_,i)=>polyPt(i*72,36)).join(' '),                 // 1 pentagon
                    () => Array.from({length:6},(_,i)=>polyPt(i*60,37)).join(' '),                 // 2 hexagon
                    () => Array.from({length:8},(_,i)=>polyPt(i*45, i%2===0?38:32)).join(' '),    // 3 squished octagon
                    () => Array.from({length:16},(_,i)=>polyPt(i*22.5, i%2===0?40:28)).join(' '), // 4 8-point star
                    () => Array.from({length:24},(_,i)=>polyPt(i*15, i%2===0?40:29)).join(' '),   // 5 12-point star
                    () => Array.from({length:32},(_,i)=>polyPt(i*11.25, i%2===0?40:24)).join(' '),// 6 16-point sharp star
                    () => Array.from({length:48},(_,i)=>polyPt(i*7.5, i%2===0?40:20)).join(' '),  // 7 24-point sun
                  ];
                  // fallback safe call
                  const pts = (rankShapes[rankIdx] ?? rankShapes[4])();
                  // spike count for accent dots
                  const spikeCounts = [4,5,6,8,8,12,16,24];
                  const spikeCount = spikeCounts[rankIdx] ?? 8;
                  const outerR = 40;
                  // gradient stop colours per rank tier
                  const gc2 = rank ? SOUL_RANKS[Math.min(rankIdx + 1, SOUL_RANKS.length - 1)].color : '#5c82d4';

                  return (
                    <div style={{
                      background: rank
                        ? `linear-gradient(145deg, ${rc}0d 0%, rgba(8,16,48,0.82) 60%, ${gc2}0d 100%)`
                        : 'rgba(8,16,48,0.7)',
                      border: `1px solid ${rc}30`,
                      borderRadius: '14px',
                      padding: '14px 14px',
                      boxShadow: rank ? `0 0 24px ${rc}14, inset 0 0 30px ${rc}06` : 'none',
                      position: 'relative',
                    }}>
                      {/* ? 按钮放右上角 */}
                      {rank && (
                        <button
                          onClick={() => setShowRules(true)}
                          style={{
                            position: 'absolute', top: '14px', right: '16px',
                            width: '22px', height: '22px', borderRadius: '50%',
                            background: `${rc}22`, border: `1px solid ${rc}55`,
                            color: `${rc}cc`, fontSize: '12px', fontWeight: 'bold',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontFamily: 'serif', lineHeight: 1, padding: 0,
                          }}
                          title="灵魂段位说明"
                        >?</button>
                      )}

                      {/* 头像区 */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: rank ? '10px' : '12px' }}>
                        {/* SVG 多边形头像框 */}
                        <div style={{ position: 'relative', flexShrink: 0, width: '88px', height: '88px' }}>
                          <svg width="88" height="88" style={{ position: 'absolute', inset: 0 }}>
                            <defs>
                              <linearGradient id="frameGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor={rc} stopOpacity="0.95" />
                                <stop offset="50%" stopColor={gc2} stopOpacity="0.7" />
                                <stop offset="100%" stopColor={rc} stopOpacity="0.95" />
                              </linearGradient>
                              <filter id="frameGlow">
                                <feGaussianBlur stdDeviation="2.5" result="blur" />
                                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                              </filter>
                              {/* clip path matching the avatar circle */}
                              <clipPath id="avatarClip">
                                <circle cx="44" cy="44" r="28" />
                              </clipPath>
                            </defs>
                            {/* outer decorative polygon — filled semi-transparent */}
                            <polygon points={pts} fill={`${rc}18`} stroke="none" />
                            {/* polygon stroke — the actual frame */}
                            <polygon points={pts} fill="none" stroke="url(#frameGrad)" strokeWidth="2" filter="url(#frameGlow)" />
                            {/* corner accent dots at spike tips */}
                            {Array.from({ length: spikeCount }, (_, i) => {
                              const [x, y] = polyPt(i * (360 / spikeCount), outerR - 1).split(',').map(Number);
                              return <circle key={i} cx={x} cy={y} r={spikeCount <= 6 ? 2.8 : spikeCount <= 12 ? 2.2 : 1.6} fill={rc} opacity="0.9" />;
                            })}
                          </svg>
                          {/* Avatar circle centred inside */}
                          <div style={{
                            position: 'absolute',
                            top: '50%', left: '50%',
                            transform: 'translate(-50%, -50%)',
                            width: '56px', height: '56px', borderRadius: '50%',
                            background: `radial-gradient(circle at 35% 32%, ${rc}66 0%, #070f2a 65%)`,
                            border: `1.5px solid ${rc}88`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '22px', fontWeight: 'bold', color: '#fff',
                            letterSpacing: '0px',
                            textShadow: `0 0 10px ${rc}`,
                          }}>
                            {(authUser.nickname || authUser.username).slice(0, 1).toUpperCase()}
                          </div>
                          {/* rank icon badge bottom-right */}
                          {rank && (
                            <div style={{
                              position: 'absolute', bottom: '4px', right: '4px',
                              width: '22px', height: '22px', borderRadius: '50%',
                              background: `radial-gradient(circle, #060e28 60%, ${rc}33)`,
                              border: `1.5px solid ${rc}88`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '12px',
                            }}>{rank.icon}</div>
                          )}
                        </div>

                        {/* 名字 + 段位 + 进度 */}
                        <div style={{ flex: 1, overflow: 'hidden', paddingTop: '2px' }}>
                          {nicknameEditing ? (
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <input
                                value={nicknameEdit}
                                onChange={e => setNicknameEdit(e.target.value)}
                                style={{
                                  flex: 1, background: 'rgba(8,18,50,0.7)', border: '1px solid rgba(80,120,200,0.3)',
                                  borderRadius: '6px', color: 'rgba(200,220,255,0.9)', fontSize: '14px', padding: '5px 10px', outline: 'none',
                                }}
                                maxLength={20}
                              />
                              <button
                                onClick={async () => {
                                  if (!nicknameEdit.trim() || !authToken) return;
                                  setNicknameSaving(true);
                                  try {
                                    const r = await fetch('/api/h5/auth/nickname', {
                                      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
                                      body: JSON.stringify({ nickname: nicknameEdit.trim() }),
                                    });
                                    const j = await r.json();
                                    if (j.code === 0) {
                                      const updated = { ...authUser, nickname: nicknameEdit.trim() };
                                      setAuthUser(updated);
                                      localStorage.setItem('txbt_user', JSON.stringify(updated));
                                      setNicknameEditing(false);
                                    }
                                  } finally { setNicknameSaving(false); }
                                }}
                                disabled={nicknameSaving}
                                style={{ background: 'rgba(60,100,200,0.5)', border: 'none', borderRadius: '5px', color: '#fff', padding: '5px 10px', fontSize: '12px', cursor: 'pointer' }}
                              >保存</button>
                              <button
                                onClick={() => setNicknameEditing(false)}
                                style={{ background: 'none', border: 'none', color: 'rgba(150,170,210,0.5)', padding: '5px', cursor: 'pointer', fontSize: '14px' }}
                              >✕</button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <div style={{ color: 'rgba(200,220,255,0.92)', fontSize: '18px', letterSpacing: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {authUser.nickname || authUser.username}
                              </div>
                              {/* 段位 icon + title 紧跟在名字后 */}
                              {rank && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                  <span style={{ fontSize: '13px', lineHeight: 1 }}>{rank.icon}</span>
                                  <span style={{ color: rc, fontSize: '12px', fontWeight: 'bold', letterSpacing: '1px', textShadow: `0 0 6px ${rc}88` }}>{rank.title}</span>
                                </span>
                              )}
                              <button
                                onClick={() => { setNicknameEdit(authUser.nickname || ''); setNicknameEditing(true); }}
                                style={{ background: 'none', border: 'none', color: 'rgba(150,170,210,0.3)', cursor: 'pointer', fontSize: '13px', padding: '2px', flexShrink: 0 }}
                              >✎</button>
                            </div>
                          )}

                          {/* 段位进度 */}
                          {rank && (
                            <div style={{ marginTop: '5px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                                <span style={{ color: `${rc}88`, fontSize: '11px' }}>{rank.label}</span>
                              </div>
                              {/* 进度条 */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ flex: 1, height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                                  <div style={{
                                    height: '100%', borderRadius: '2px',
                                    width: `${progress}%`,
                                    background: `linear-gradient(90deg, ${rc}88, ${rc})`,
                                    boxShadow: `0 0 6px ${rc}99`,
                                    transition: 'width 0.6s ease',
                                  }} />
                                </div>
                                <span style={{ color: `${rc}99`, fontSize: '10px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                  {profileStats!.totalScore}{next ? `/${next.min - 1}` : ''}
                                </span>
                              </div>
                              {next && (
                                <div style={{ color: 'rgba(150,170,210,0.35)', fontSize: '10px', marginTop: '3px' }}>
                                  距「{next.title}」还差 {next.min - profileStats!.totalScore} 分
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 统计数值 */}
                      {profileLoading ? (
                        <div style={{ textAlign: 'center', color: 'rgba(200,169,110,0.3)', fontSize: '13px', letterSpacing: '2px', padding: '10px 0' }}>灵光汇聚中…</div>
                      ) : profileStats ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                          {[
                            { label: '点亮灵魂', value: profileStats.bookCount ?? '—', unit: '', color: '#f59e42', sub: '先贤' },
                            { label: '论道次数', value: profileStats.msgCount ?? '—', unit: '', color: '#34d399', sub: '发言' },
                            { label: '笔谈篇数', value: profileStats.noteCount, unit: '', color: '#7dd3fc', sub: '笔谈' },
                            { label: '累计分值', value: profileStats.totalScore, unit: '', color: rc, sub: '积分' },
                          ].map(s => (
                            <div key={s.label} style={{
                              background: 'rgba(0,5,20,0.45)', borderRadius: '8px',
                              padding: '8px 4px 6px', textAlign: 'center',
                              border: `1px solid ${s.color}22`,
                            }}>
                              <div style={{ color: s.color, fontSize: '18px', fontWeight: 'bold', lineHeight: 1 }}>
                                {s.value}
                              </div>
                              <div style={{ color: 'rgba(150,170,210,0.5)', fontSize: '9px', marginTop: '4px', letterSpacing: '0.5px' }}>
                                {s.label}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <button
                          onClick={() => authToken && loadProfileStats(authToken)}
                          style={{
                            width: '100%', padding: '10px', background: 'rgba(30,50,120,0.4)', border: '1px solid rgba(80,120,200,0.2)',
                            borderRadius: '8px', color: 'rgba(150,180,240,0.6)', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '2px',
                          }}
                        >查看修炼成果</button>
                      )}
                    </div>
                  );
                })()}

                {/* 设置区 */}
                <div style={{
                  background: 'rgba(8,16,48,0.7)',
                  border: '1px solid rgba(80,120,200,0.12)',
                  borderRadius: '12px',
                  overflow: 'hidden',
                }}>
                  <div style={{ padding: '9px 14px', borderBottom: '1px solid rgba(80,120,200,0.08)', color: 'rgba(150,170,210,0.4)', fontSize: '11px', letterSpacing: '3px' }}>
                    设　置
                  </div>
                  <div
                    onClick={handleLogout}
                    style={{
                      padding: '11px 14px', cursor: 'pointer', color: 'rgba(255,130,100,0.65)',
                      fontSize: '13px', letterSpacing: '2px', transition: 'background 0.2s',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}
                  >
                    <span>退出登录</span>
                    <span style={{ fontSize: '16px', opacity: 0.5 }}>›</span>
                  </div>
                </div>

                {/* 灵魂段位说明面板 */}
                {showRules && (
                  <div style={{
                    position: 'fixed', inset: 0, zIndex: 9200,
                    background: 'rgba(0,2,10,0.88)', backdropFilter: 'blur(12px)',
                    display: 'flex', flexDirection: 'column',
                    fontFamily: '"KaiTi", "STKaiti", serif',
                  }} onClick={() => setShowRules(false)}>
                    <div
                      style={{
                        margin: 'auto',
                        width: 'min(92vw, 460px)',
                        maxHeight: '82vh',
                        background: 'linear-gradient(180deg, #040c24 0%, #020812 100%)',
                        border: '1px solid rgba(200,169,110,0.22)',
                        borderRadius: '20px',
                        display: 'flex', flexDirection: 'column',
                        overflow: 'hidden',
                      }}
                      onClick={e => e.stopPropagation()}
                    >
                      {/* 面板标题 */}
                      <div style={{
                        padding: '20px 22px 16px',
                        borderBottom: '1px solid rgba(200,169,110,0.12)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        flexShrink: 0,
                      }}>
                        <div>
                          <div style={{ color: '#c8a96e', fontSize: '1.1rem', letterSpacing: '4px', textShadow: '0 0 14px #c8a96e80' }}>灵魂成长之道</div>
                          <div style={{ color: 'rgba(150,170,210,0.4)', fontSize: '11px', letterSpacing: '2px', marginTop: '3px' }}>以分值丈量修行深度</div>
                        </div>
                        <button onClick={() => setShowRules(false)} style={{ background: 'none', border: 'none', color: 'rgba(150,170,210,0.4)', fontSize: '20px', cursor: 'pointer', padding: '4px 8px' }}>✕</button>
                      </div>

                      {/* 玩法说明 */}
                      <div style={{
                        padding: '16px 22px 10px',
                        background: 'rgba(0,5,18,0.5)',
                        borderBottom: '1px solid rgba(80,120,200,0.1)',
                        flexShrink: 0,
                      }}>
                        <div style={{ color: 'rgba(200,169,110,0.7)', fontSize: '12px', letterSpacing: '2px', marginBottom: '8px' }}>✦ 如何获得分值</div>
                        {[
                          ['每完成一次笔谈', '获得 1～5 分（由对话质量决定）'],
                          ['深度思考与独到见解', '获得更高评分'],
                          ['与先贤产生思想碰撞', '提升对话评分'],
                          ['积极参与、持续探索', '分值持续累计'],
                        ].map(([key, val]) => (
                          <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(80,120,200,0.06)' }}>
                            <span style={{ color: 'rgba(200,220,255,0.55)', fontSize: '12px' }}>{key}</span>
                            <span style={{ color: 'rgba(200,169,110,0.7)', fontSize: '12px' }}>{val}</span>
                          </div>
                        ))}
                      </div>

                      {/* 段位列表 */}
                      <div style={{ overflowY: 'auto', padding: '12px 22px 20px', flex: 1 }}>
                        <div style={{ color: 'rgba(200,169,110,0.7)', fontSize: '12px', letterSpacing: '2px', marginBottom: '10px' }}>✦ 段位体系</div>
                        {SOUL_RANKS.map((rank, i) => {
                          const current = profileStats ? getSoulRank(profileStats.totalScore) : null;
                          const isCurrent = current?.title === rank.title;
                          return (
                            <div key={i} style={{
                              display: 'flex', alignItems: 'flex-start', gap: '12px',
                              padding: '10px 12px',
                              marginBottom: '6px',
                              borderRadius: '10px',
                              background: isCurrent ? `${rank.color}14` : 'rgba(0,5,18,0.4)',
                              border: `1px solid ${isCurrent ? rank.color + '44' : 'rgba(80,120,200,0.1)'}`,
                              transition: 'all 0.2s',
                            }}>
                              <span style={{ fontSize: '20px', flexShrink: 0, marginTop: '1px' }}>{rank.icon}</span>
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '2px' }}>
                                  <span style={{ color: isCurrent ? rank.color : `${rank.color}cc`, fontSize: '15px', fontWeight: isCurrent ? 'bold' : 'normal', textShadow: isCurrent ? `0 0 10px ${rank.color}66` : 'none' }}>
                                    {rank.title}
                                  </span>
                                  <span style={{ color: `${rank.color}88`, fontSize: '11px' }}>{rank.label}</span>
                                  {isCurrent && <span style={{ color: rank.color, fontSize: '10px', background: `${rank.color}22`, padding: '1px 6px', borderRadius: '10px', border: `1px solid ${rank.color}44` }}>当前</span>}
                                </div>
                                <div style={{ color: 'rgba(150,170,210,0.45)', fontSize: '11px', lineHeight: '1.5', marginBottom: '3px' }}>{rank.desc}</div>
                                <div style={{ color: `${rank.color}66`, fontSize: '11px' }}>
                                  {rank.max === Infinity ? `${rank.min} 分以上` : `${rank.min} ~ ${rank.max} 分`}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* 未登录状态 */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* 访客卡 */}
                <div style={{
                  background: 'rgba(8,16,48,0.7)',
                  border: '1px solid rgba(120,160,230,0.12)',
                  borderRadius: '14px',
                  padding: '16px 16px',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: '30px', marginBottom: '8px' }}>🌌</div>
                  <div style={{ color: 'rgba(200,220,255,0.6)', fontSize: '14px', letterSpacing: '2px', marginBottom: '4px' }}>访客身份</div>
                  <div style={{ color: 'rgba(120,150,200,0.4)', fontSize: '11px', letterSpacing: '1px', lineHeight: '1.7', marginBottom: '12px' }}>
                    登录后可无限与先贤对话，并记录修炼历程
                  </div>
                  {/* 访客剩余次数 */}
                  <div style={{
                    background: 'rgba(0,5,20,0.4)', borderRadius: '8px', padding: '7px 12px', marginBottom: '12px',
                    border: '1px solid rgba(100,130,200,0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  }}>
                    <span style={{ color: 'rgba(150,180,240,0.5)', fontSize: '11px', letterSpacing: '1px' }}>畅言余额：</span>
                    <span style={{ color: guestMsgCount >= guestLimit ? 'rgba(255,130,100,0.7)' : '#7dd3fc', fontSize: '14px' }}>
                      {Math.max(0, guestLimit - guestMsgCount)} / {guestLimit} 次
                    </span>
                  </div>
                  <button
                    onClick={() => setShowLoginModal(true)}
                    style={{
                      width: '100%', padding: '10px', borderRadius: '10px', border: 'none',
                      background: 'linear-gradient(135deg, rgba(80,120,220,0.85), rgba(50,90,180,0.85))',
                      color: '#fff', fontSize: '14px', fontFamily: 'inherit', letterSpacing: '4px',
                      cursor: 'pointer', boxShadow: '0 2px 12px rgba(60,100,220,0.25)',
                    }}
                  >
                    登录 / 注册
                  </button>
                </div>
              </div>
            )}

            {/* 页脚装饰 */}
            <div style={{ textAlign: 'center', color: 'rgba(200,169,110,0.15)', fontSize: '11px', letterSpacing: '2px', paddingBottom: '4px' }}>
              ※ 太虚书院 · 与古今先贤对话 ※
            </div>
          </div>
        </div>
      )}

      {/* ===== 底部 Tab 菜单 ===== */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 7000,
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        height: 'calc(60px + env(safe-area-inset-bottom))',
        background: 'linear-gradient(180deg, rgba(4,10,28,0.0) 0%, rgba(8,16,40,0.75) 25%, rgba(6,12,32,0.92) 100%)',
        backdropFilter: 'blur(16px)',
        borderTop: '1px solid rgba(80,120,200,0.18)',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.5)',
        fontFamily: '"KaiTi", "STKaiti", serif',
        paddingBottom: 'env(safe-area-inset-bottom)',
        alignItems: 'flex-start',
        paddingTop: '6px',
      }}>
        {([
          { key: 'explore', label: '神游太虚', icon: '✦' },
          { key: 'souls', label: '太虚问道', icon: '☯' },
          { key: 'notes', label: '太虚笔谈', icon: '✍' },
          { key: 'profile', label: '灵　犀', icon: '◈' },
        ] as { key: 'explore' | 'souls' | 'notes' | 'profile'; label: string; icon: string }[]).map(tab => (
          <div
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key);
              if (tab.key === 'souls') {
                fetch(`/api/h5/chat-sessions?userId=${encodeURIComponent(currentUserId)}`).then(r => r.json()).then(j => {
                  if (j.code === 0) setChatSessions(j.data || []);
                }).catch(() => {});
              }
              if (tab.key === 'notes') {
                setNotesLoading(true);
                fetch(`/api/h5/notes?userId=${encodeURIComponent(currentUserId)}`).then(r => r.json()).then(j => {
                  if (j.code === 0) setNotesList(j.data || []);
                }).catch(() => {}).finally(() => setNotesLoading(false));
              }
              if (tab.key === 'profile' && authToken) {
                loadProfileStats(authToken);
              }
            }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '2px',
              cursor: 'pointer',
              color: activeTab === tab.key ? '#7dd3fc' : 'rgba(210,225,248,0.82)',
              transition: 'color 0.3s',
              padding: '4px 12px',
            }}
          >
            <span style={{
              fontSize: '1.4rem',
              filter: activeTab === tab.key ? 'drop-shadow(0 0 6px rgba(120,200,255,0.7))' : 'none',
              transition: 'filter 0.3s',
            }}>
              {tab.icon}
            </span>
            <span style={{
              fontSize: '0.7rem',
              letterSpacing: '2px',
              textShadow: activeTab === tab.key ? '0 0 8px rgba(100,180,255,0.6)' : 'none',
            }}>
              {tab.label}
            </span>
          </div>
        ))}
      </div>

      {/* 灵魂加载界面 */}
      {soulLoading && (
        <SoulLoading
          author={soulLoading.author}
          era={soulLoading.era}
          bookTitle={soulLoading.title}
          soulColor={soulLoading.soulColor}
          onClose={handleCloseSoul}
          onEnter={handleEnterDialog}
        />
      )}

      {/* 灵魂对弈界面 */}
      {soulDialog && (
        <SoulDialog
          book={soulDialog}
          onClose={handleCloseDialog}
          userId={currentUserId}
          guestId={authUser ? guestFingerprint : undefined}
          isGuest={!authUser}
          guestMsgCount={guestMsgCount}
          guestLimit={guestLimit}
          onGuestLimitReached={handleGuestLimitReached}
          onUserMessage={handleGuestMessage}
          userScore={profileStats?.totalScore}
          userDisplayName={authUser ? (authUser.nickname || authUser.username) : undefined}
        />
      )}

      {/* 院长对话界面 */}
      {showDean && <DeanDialog onClose={() => setShowDean(false)} userId={currentUserId ?? undefined} />}

      {/* ===== 登录/注册弹窗 ===== */}
      {showLoginModal && (
        <LoginModal
          onSuccess={handleAuthSuccess}
          onClose={() => { setShowLoginModal(false); setLoginLimitReached(false); }}
          isLimitReached={loginLimitReached}
        />
      )}

      {/* 召唤院长悬浮按钮 */}
      {!soulLoading && !soulDialog && !showDean && (
        <div
          onClick={() => setShowDean(true)}
          title="召唤院长"
          style={{
            position: 'fixed', right: '18px', bottom: 'calc(60px + env(safe-area-inset-bottom) + 18px)', zIndex: 6500,
            width: '52px', height: '52px', borderRadius: '50%',
            background: 'linear-gradient(145deg, #c8a96e, #8a6830)',
            border: '1.5px solid rgba(200,169,110,0.6)',
            boxShadow: '0 0 20px rgba(200,169,110,0.45), 0 4px 16px rgba(0,0,0,0.5)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.4rem',
            animation: 'dean-pulse 3s ease-in-out infinite',
          }}
        >
          📜
        </div>
      )}

      <style>{`
        @keyframes dean-pulse {
          0%, 100% { box-shadow: 0 0 20px rgba(200,169,110,0.45), 0 4px 16px rgba(0,0,0,0.5); }
          50% { box-shadow: 0 0 32px rgba(200,169,110,0.75), 0 4px 24px rgba(0,0,0,0.6), 0 0 0 6px rgba(200,169,110,0.12); }
        }
      `}</style>
    </div>
  );
}