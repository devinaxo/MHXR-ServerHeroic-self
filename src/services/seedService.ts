import {
  Event, AssualtEvents, ScoreEvents, TicketEvents, TourEvents, StandingEvents, M16Events,
} from '../model/events/index.js';
import QuestSheet from '../model/questSheet.js';

import normalTutorialQuestSheets from '../json/questDB/normal.extended.complete.json' with { type: 'json' };
import trainingQuestSheets from '../json/questDB/training.extended.complete.json' with { type: 'json' };
import scoreQuestSheets from '../json/questDB/score.extended.complete.json' with { type: 'json' };
import eternalQuestSheets from '../json/questDB/eternal.extended.complete.json' with { type: 'json' };
import ticketQuestSheets from '../json/questDB/ticket.extended.complete.json' with { type: 'json' };
import eventQuestSheets from '../json/questDB/event.extended.blank.json' with { type: 'json' };
import ticketEvents from '../json/ticket_events.json' with { type: 'json' };
import coevEvents from '../json/coev_events.json' with { type: 'json' };
import easyEvents from '../json/easy_events.json' with { type: 'json' };
import normEvents from '../json/norm_events.json' with { type: 'json' };
import hardEvents from '../json/hard_events.json' with { type: 'json' };
import forbEvents from '../json/forb_events.json' with { type: 'json' };

// Type definition for quest sheet JSON imports
interface QuestSheetJson {
  rQuestSheet: {
    mQuestDataList: Record<string, unknown>[];
  };
}

// Cast JSON imports to resolve deep nested type access
const typedNormal = normalTutorialQuestSheets as unknown as QuestSheetJson;
const typedTraining = trainingQuestSheets as unknown as QuestSheetJson;
const typedScore = scoreQuestSheets as unknown as QuestSheetJson;
const typedEternal = eternalQuestSheets as unknown as QuestSheetJson;
const typedTicket = ticketQuestSheets as unknown as QuestSheetJson;
const typedEvent = eventQuestSheets as unknown as QuestSheetJson;

interface Logger {
  info: (message: string) => void;
  error: (message: string, error?: unknown) => void;
}

// Era 30 giorni (valore di upstream): al primo avvio (14/08) assault, score e
// ticket nascevano con scadenza 13/09, e da quel giorno il gioco li mostrava
// tutti come "現在非開催です" (non in corso). 10 anni e' lo stesso orizzonte
// gia' usato da seed-events.cjs per tour/standing/m16, verificato funzionante.
// Il client riceve i secondi rimanenti come intero, quindi non si puo' mettere
// un valore davvero infinito: la durata "infinita" la da' renewEventDeadlines.
const EVENT_DURATION_MS = 3650 * 24 * 60 * 60 * 1000;

/*
 * Rinnovo a ogni avvio: qualunque evento che scade entro un anno viene
 * riportato a 10 anni da adesso. Tocca solo le date, mai id/quest/banner.
 * E' cio' che rende gli eventi di fatto permanenti: basta che il server venga
 * riavviato almeno una volta ogni 9 anni.
 */
async function renewEventDeadlines(log: Logger): Promise<void> {
  const now = Date.now();
  const soglia = new Date(now + 365 * 24 * 60 * 60 * 1000);
  const fine = new Date(now + EVENT_DURATION_MS);

  const piani = [
    { nome: 'assault', model: AssualtEvents, campi: ['end_remain', 'disappear_remain'] },
    { nome: 'score', model: ScoreEvents, campi: ['end_remain'] },
    { nome: 'ticket', model: TicketEvents, campi: ['end_remain', 'buy_end_remain'] },
    { nome: 'tour', model: TourEvents, campi: ['end_remain'] },
    { nome: 'standing', model: StandingEvents, campi: ['end_remain'] },
    { nome: 'm16', model: M16Events, campi: ['end_remain', 'disappear_remain'] },
  ] as const;

  for (const p of piani) {
    for (const campo of p.campi) {
      const r = await (p.model as typeof AssualtEvents).collection.updateMany(
        { [campo]: { $lt: soglia } },
        { $set: { [campo]: fine } },
      );
      if (r.modifiedCount > 0) log.info(`Event deadlines renewed: ${p.nome}.${campo} x${r.modifiedCount}`);
    }
  }
}

async function seedEvents(log: Logger): Promise<void> {
  const count = await Event.countDocuments({});
  log.info(`Number of Events: ${count}`);
  if (count == 0) {
    const eventDefault = new Event();
    await eventDefault.save();
    log.info('Event Data imported successfully.');
  } else {
    log.info('Event Data is not empty. Skipping import.');
  }
}

async function seedAssaultEvents(log: Logger): Promise<void> {
  const count = await AssualtEvents.countDocuments({});
  log.info(`Number of Assualt Events: ${count}`);
  if (count == 0) {
    const allEvents = [
      ...easyEvents,
      ...normEvents,
      ...hardEvents,
      ...forbEvents,
    ];
    for (const event of allEvents) {
      await AssualtEvents.create({
        appear_remain: Date.now(),
        disappear_remain: Date.now() + EVENT_DURATION_MS,
        end_remain: Date.now() + EVENT_DURATION_MS,
        start_remain: Date.now(),
        ...event,
      });
    }
    log.info('Assualt Event Data imported successfully.');
  } else {
    log.info('Assualt Event Data is not empty. Skipping import.');
  }
}

async function seedScoreEvents(log: Logger): Promise<void> {
  const count = await ScoreEvents.countDocuments({});
  log.info(`Number of Score Events: ${count}`);
  if (count == 0) {
    for (const coevEvent of coevEvents) {
      await ScoreEvents.create({
        end_remain: Date.now() + EVENT_DURATION_MS,
        start_remain: Date.now(),
        ...coevEvent,
      });
    }
    log.info('Score Event Data imported successfully.');
  } else {
    log.info('Score Event Data is not empty. Skipping import.');
  }
}

async function seedTicketEvents(log: Logger): Promise<void> {
  const count = await TicketEvents.countDocuments({});
  log.info(`Number of Ticket Events: ${count}`);
  if (count == 0) {
    for (const ticketEvent of ticketEvents) {
      await TicketEvents.create({
        buy_end_remain: Date.now() + EVENT_DURATION_MS,
        buy_start_remain: Date.now(),
        clear_time: 0,
        end_remain: Date.now() + EVENT_DURATION_MS,
        start_remain: Date.now(),
        ...ticketEvent,
      });
    }
    log.info('Ticket Event Data imported successfully.');
  } else {
    log.info('Ticket Event Data is not empty. Skipping import.');
  }
}

/*
 * Il convertitore XFS avvolge alcuni array dentro {array:{mpArray:[...]}} o
 * {classref_:{mpArray:[...]}}. Lo schema Mongoose se ne aspetta uno semplice:
 * ricevendo l'oggetto avvolto scrive [null] (i campi spariscono). E' successo
 * alle ricompense di TUTTE le 1.524 quest evento (mRewardItemList) e ai boss,
 * che poi sono stati recuperati da tools-js/restore-bosses.cjs. Qui si srotola
 * PRIMA dell'insert, cosi' un database ricreato da zero non perde piu' niente.
 */
function srotolaArray(valore: unknown): unknown[] | undefined {
  if (Array.isArray(valore)) return valore as unknown[];
  const avvolto = valore as
    | { array?: { mpArray?: unknown }; classref_?: { mpArray?: unknown } }
    | null
    | undefined;
  const arr = avvolto?.classref_?.mpArray ?? avvolto?.array?.mpArray;
  return Array.isArray(arr) ? (arr as unknown[]) : undefined;
}

export function normalizzaQuest(quest: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...quest };
  for (const chiave of ['mRewardItemList', 'mBossList']) {
    const piatto = srotolaArray(quest[chiave]);
    if (piatto) out[chiave] = piatto;
  }
  return out;
}

async function seedQuestSheets(log: Logger): Promise<void> {
  const count = await QuestSheet.countDocuments({});
  log.info(`Number of Quests: ${count}`);
  if (count === 0) {
    const lista = [
      ...typedNormal.rQuestSheet.mQuestDataList,
      ...typedTraining.rQuestSheet.mQuestDataList,
      ...typedScore.rQuestSheet.mQuestDataList,
      ...typedEternal.rQuestSheet.mQuestDataList,
      ...typedTicket.rQuestSheet.mQuestDataList,
      ...typedEvent.rQuestSheet.mQuestDataList,
    ].map(normalizzaQuest);
    await QuestSheet.insertMany(lista);
    log.info('Quest Data imported successfully.');
  } else {
    log.info('Quest Data is not empty. Skipping import.');
  }
}

export async function seedDatabase(log: Logger): Promise<void> {
  await seedEvents(log);
  await seedAssaultEvents(log);
  await seedScoreEvents(log);
  await seedTicketEvents(log);
  await seedQuestSheets(log);
  await renewEventDeadlines(log);
}
