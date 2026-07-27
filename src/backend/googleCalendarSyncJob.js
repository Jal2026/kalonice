import { ejecutarSyncCalendar } from 'backend/googleCalendarSync.web';

export async function googleCalendarSyncDaily() {
    await ejecutarSyncCalendar();
}