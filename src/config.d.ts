import * as THREE from 'three';

export interface BookData {
  id: string;
  title: string;
  author: string;
  era: string;
  soulColor: string;
  pos: THREE.Vector3;
  color: string;
}

export declare const BOOKS_DATA: BookData[];
export declare const STATIC_STARS_COUNT: number;
export declare const TWINKLING_STARS_COUNT: number;
export declare const METEORS_COUNT: number;
