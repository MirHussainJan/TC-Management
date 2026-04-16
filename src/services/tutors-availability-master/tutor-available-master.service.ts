import RefreshTutorCountService from './refresh-tutor-count.service';

export default class TutorAvailableMasterService {
  static async RefreshTutorCount(event) {
    try {
      await RefreshTutorCountService.RefreshTutorCount(event);
    } catch (err) {
      throw err;
    }
  }
}
