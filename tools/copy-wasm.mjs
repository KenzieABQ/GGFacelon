// Copies MediaPipe's WASM runtime into public/ so the app serves it itself (run on npm install).
import { cpSync, mkdirSync } from 'node:fs';
const from = new URL('../node_modules/@mediapipe/tasks-vision/wasm/', import.meta.url);
const to = new URL('../public/mediapipe/wasm/', import.meta.url);
mkdirSync(to, { recursive: true });
cpSync(from, to, { recursive: true });
console.log('copied MediaPipe wasm → public/mediapipe/wasm');
