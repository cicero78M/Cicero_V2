import provinces from '../data/polda.json' assert { type: 'json' };
import poldaPolres from '../data/polda_polres.json' assert { type: 'json' };
import * as model from '../model/poldaModel.js';

export async function initPolda() {
  for (const item of provinces) {
    const polda = await model.upsertPolda(item.polda);
    if (!polda) continue;
    for (const kota of item.kota) {
      await model.upsertKota(polda.id, kota);
    }
  }
}

export async function initPoldaPolres() {
  for (const item of poldaPolres) {
    const polda = await model.upsertPolda(item.nama_polda);
    if (!polda) continue;
    for (const polres of item.polres) {
      await model.upsertKota(polda.id, polres);
    }
  }
}
