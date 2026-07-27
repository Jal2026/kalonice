import { ejecutarRecordatoriosDiarios } from 'backend/reminderLogic.web';

export async function reminderJobDaily() {
  await ejecutarRecordatoriosDiarios();
}