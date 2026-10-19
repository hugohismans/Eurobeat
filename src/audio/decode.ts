/**
 * Décodage d'un fichier audio du joueur. On essaie d'abord le décodeur du navigateur (MP3, AAC,
 * OGG, WAV, et FLAC sur les navigateurs récents) ; si un FLAC lui résiste (navigateur ancien,
 * 24 bits / 192 kHz, multicanal…), on passe par libFLAC compilé en WebAssembly, chargé seulement
 * dans ce cas.
 */

/** Pour les tests : forcer le décodeur FLAC de secours. */
export const decodeOptions = { forceFlacFallback: false };

/** FLAC natif (« fLaC », éventuellement précédé d'un tag ID3) ou Ogg FLAC. */
export function looksLikeFlac(bytes: ArrayBuffer, name = ''): boolean {
  const u = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 64 * 1024));
  const at = (i: number, s: string) => [...s].every((c, k) => u[i + k] === c.charCodeAt(0));
  if (at(0, 'fLaC')) return true;
  if (at(0, 'ID3')) {
    // taille du tag ID3v2 : 4 octets « synchsafe »
    const size = ((u[6] & 0x7f) << 21) | ((u[7] & 0x7f) << 14) | ((u[8] & 0x7f) << 7) | (u[9] & 0x7f);
    if (at(10 + size, 'fLaC')) return true;
  }
  if (at(0, 'OggS')) for (let i = 0; i < Math.min(u.length - 4, 512); i++) if (at(i, 'FLAC')) return true;
  return /\.(flac|fla|oga)$/i.test(name);
}

/**
 * @param bytes contenu du fichier (détaché par le décodeur natif)
 * @param reread relit le fichier si le décodeur natif échoue (évite de garder une copie en mémoire)
 */
export async function decodeAudio(ctx: BaseAudioContext, bytes: ArrayBuffer, name: string, reread: () => Promise<ArrayBuffer>, onStatus?: (s: string) => void): Promise<AudioBuffer> {
  const flac = looksLikeFlac(bytes, name);
  if (!(flac && decodeOptions.forceFlacFallback)) {
    try {
      return await ctx.decodeAudioData(bytes);
    } catch (e) {
      if (!flac) throw e;
    }
  }
  onStatus?.('Décodage FLAC (décodeur intégré)…');
  return decodeFlac(ctx, new Uint8Array(await reread()));
}

async function decodeFlac(ctx: BaseAudioContext, data: Uint8Array): Promise<AudioBuffer> {
  const { FLACDecoderWebWorker } = await import('@wasm-audio-decoders/flac');
  const decoder = new FLACDecoderWebWorker();
  try {
    await decoder.ready;
    const r = await decoder.decodeFile(data);
    if (!r.samplesDecoded || !r.channelData.length) throw new Error(r.errors[0]?.message ?? 'FLAC illisible');
    const src = new AudioBuffer({ length: r.samplesDecoded, numberOfChannels: r.channelData.length, sampleRate: r.sampleRate });
    r.channelData.forEach((ch, i) => src.copyToChannel(ch as Float32Array<ArrayBuffer>, i));
    if (r.channelData.length <= 2 && r.sampleRate === ctx.sampleRate) return src;
    // haute résolution / multicanal : rééchantillonné à la fréquence du contexte et mixé en stéréo
    // (le mixage 5.1 → stéréo est fait par le moteur audio)
    const length = Math.ceil((r.samplesDecoded * ctx.sampleRate) / r.sampleRate);
    const off = new OfflineAudioContext(Math.min(2, src.numberOfChannels), length, ctx.sampleRate);
    const node = off.createBufferSource();
    node.buffer = src;
    node.connect(off.destination);
    node.start();
    return await off.startRendering();
  } finally {
    void decoder.free();
  }
}
