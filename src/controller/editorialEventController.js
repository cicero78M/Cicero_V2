import * as eventModel from '../model/editorialEventModel.js';
import * as penmasUserModel from '../model/penmasUserModel.js';
import { sendSuccess } from '../utils/response.js';

export async function getEvents(req, res, next) {
  try {
    const data = await eventModel.getEvents(req.penmasUser.user_id);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function createEvent(req, res, next) {
  try {
    const currentUser = await penmasUserModel.findById(req.penmasUser.user_id);
    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    }
    const data = {
      ...req.body,
      created_by: req.penmasUser.user_id,
      updated_by: req.penmasUser.user_id,
    };
    const ev = await eventModel.createEvent(data);
    sendSuccess(res, ev, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateEvent(req, res, next) {
  try {
    const currentUser = await penmasUserModel.findById(req.penmasUser.user_id);
    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    }
    const body = {
      ...req.body,
      updated_by: req.penmasUser.user_id,
    };
    const ev = await eventModel.updateEvent(Number(req.params.id), body);
    sendSuccess(res, ev);
  } catch (err) {
    next(err);
  }
}

export async function deleteEvent(req, res, next) {
  try {
    const ev = await eventModel.deleteEvent(Number(req.params.id));
    sendSuccess(res, ev);
  } catch (err) {
    next(err);
  }
}
