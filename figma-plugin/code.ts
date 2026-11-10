type ViewState = { schema: 1; aircraftId: string; yaw: number; pitch: number; zoom: number; transparent: boolean };
type InsertMessage = ViewState & { type: 'insert-view'; png: number[]; width: number; height: number };
type UiMessage = InsertMessage | { type: 'ready' } | { type: 'resize'; height: number };

const PANEL_WIDTH = 520;
const RELAUNCH_COMMAND = '7ccc8dfe-97b7-4a0c-b2b7-4560e70ec499';
const STATE_KEY = 'arctic-fleet-360:v1';
const NAMES: Record<string, string> = {
  ssj100: 'Sukhoi Superjet 100', boeing737: 'Boeing 737', a320: 'Airbus A320',
  crj: 'Bombardier CRJ 100/200', an24: 'Ан-24', embraer: 'Embraer 170/190',
  dhc8: 'De Havilland DHC-8-300', atr: 'ATR 42/72', yak42: 'Як-42', an26: 'Ан-26'
};
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
let working = false;

figma.showUI(__html__, { width: PANEL_WIDTH, height: 730, themeColors: true });
figma.root.setRelaunchData({ [RELAUNCH_COMMAND]: 'Выбрать самолёт и повернуть на 360°' });

function readState(raw: string): ViewState | null {
  try {
    const data = JSON.parse(raw);
    if (data.schema !== 1 || !Object.prototype.hasOwnProperty.call(NAMES, data.aircraftId)) return null;
    if (![data.yaw, data.pitch, data.zoom].every(Number.isFinite)) return null;
    return { schema: 1, aircraftId: data.aircraftId, yaw: ((data.yaw % 360) + 360) % 360,
      pitch: clamp(data.pitch, -60, 75), zoom: clamp(data.zoom, 0.65, 1.6), transparent: data.transparent !== false };
  } catch (_) { return null; }
}

function initialState(): ViewState | null {
  const selected = figma.currentPage.selection.length === 1 ? figma.currentPage.selection[0] : null;
  return (selected ? readState(selected.getPluginData(STATE_KEY)) : null) || readState(figma.root.getPluginData(STATE_KEY));
}

figma.ui.onmessage = async (message: UiMessage) => {
  if (!message || typeof message.type !== 'string') return;
  if (message.type === 'ready') {
    figma.ui.postMessage({ type: 'ready', state: initialState() });
    return;
  }
  if (message.type === 'resize') {
    if (Number.isFinite(message.height)) figma.ui.resize(PANEL_WIDTH, clamp(Math.ceil(message.height), 580, 860));
    return;
  }
  if (message.type !== 'insert-view' || working) return;
  working = true;
  let node: RectangleNode | null = null;
  try {
    const state = readState(JSON.stringify({ schema: message.schema, aircraftId: message.aircraftId,
      yaw: message.yaw, pitch: message.pitch, zoom: message.zoom, transparent: message.transparent }));
    if (!state) throw new Error('Выберите самолёт и проверьте параметры ракурса.');
    if (!Array.isArray(message.png) || message.png.length < 100 || message.png.length > 8 * 1024 * 1024 ||
      message.png.some(n => !Number.isInteger(n) || n < 0 || n > 255)) throw new Error('Не удалось прочитать изображение. Повторите вставку.');
    const png = new Uint8Array(message.png);
    if (png[0] !== 137 || png[1] !== 80 || png[2] !== 78 || png[3] !== 71) throw new Error('Ожидалось PNG-изображение.');
    if (!Number.isFinite(message.width) || !Number.isFinite(message.height) ||
      message.width < 320 || message.width > 2048 || message.height < 240 || message.height > 2048) {
      throw new Error('Размер изображения должен быть от 320 × 240 до 2048 × 2048.');
    }
    const outputWidth = 800;
    const outputHeight = Math.round(outputWidth * message.height / message.width);
    const image = figma.createImage(png);
    node = figma.createRectangle();
    node.name = `${NAMES[state.aircraftId]} · ${Math.round(state.yaw)}° · 3D ракурс`;
    node.resize(outputWidth, outputHeight);
    node.fills = [{ type: 'IMAGE', imageHash: image.hash, scaleMode: 'FIT' }];
    figma.currentPage.appendChild(node);
    node.x = Math.round(figma.viewport.center.x - outputWidth / 2);
    node.y = Math.round(figma.viewport.center.y - outputHeight / 2);
    node.setPluginData(STATE_KEY, JSON.stringify(state));
    node.setRelaunchData({ [RELAUNCH_COMMAND]: 'Изменить ракурс самолёта' });
    figma.root.setPluginData(STATE_KEY, JSON.stringify(state));
    figma.currentPage.selection = [node];
    figma.viewport.scrollAndZoomIntoView([node]);
    figma.ui.postMessage({ type: 'inserted', id: node.id, name: NAMES[state.aircraftId] });
  } catch (error) {
    if (node && !node.removed) node.remove();
    figma.ui.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Не удалось вставить ракурс. Попробуйте ещё раз.' });
  } finally {
    working = false;
  }
};
