import { webMethod, Permissions } from 'wix-web-module';
import { ejecutarRecordatoriosDiarios } from 'backend/reminderLogic.web';

export const testReminderJob = webMethod(
  Permissions.Anyone,
  async () => {
    return await ejecutarRecordatoriosDiarios();
  }
);