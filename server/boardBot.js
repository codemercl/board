import { getBoard } from './store.js'

// Board helpers the Telegram bot needs (patient names + plan cards for the
// reminder sweep). Kept in their own module so both the persistent host
// (server/index.js, polling) and the serverless webhook (server/app.js) share
// one bot instance, and to avoid a store↔bot import cycle.
export const boardDeps = {
  async getPatientName(id) {
    const board = await getBoard(false)
    return board.patients.find((p) => String(p.id) === String(id))?.name || null
  },
  async listPlanCards() {
    const board = await getBoard(false)
    return board.patients
      .filter((p) => p.stage === 'plan_wait')
      .map((p) => ({ id: p.id, name: p.name, visit: p.visit, planReview: p.planReview }))
  },
  // Cards relevant to the review workflow: being written (plan_wait) AND already
  // confirmed (plan). Drives /my and /all so doctors/head doctor can see which
  // plans are written-but-unconfirmed vs written-and-confirmed.
  async listReviewCards() {
    const board = await getBoard(false)
    return board.patients
      .filter((p) => p.stage === 'plan_wait' || p.stage === 'plan')
      .map((p) => ({ id: p.id, name: p.name, stage: p.stage, visit: p.visit, planReview: p.planReview }))
  },
}
