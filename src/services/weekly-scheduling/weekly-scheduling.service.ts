import WSUpdateTutorOffService from './ws-update-tutor-off.service';

export default class WeeklySchedulingService {
  static async UpdateTutorOff(event) {
    try {
      await WSUpdateTutorOffService.UpdateTutorOff(event);
    } catch (error) {
      throw error;
    }
  }
}
