import * as instaLikeModel from '../model/instaLikeModel.js';

export async function getAll(req, res, next) {
  try {
    const data = await instaLikeModel.findAll();
    res.json(data);
  } catch (err) { next(err); }
}

export async function getById(req, res, next) {
  try {
    const data = await instaLikeModel.findById(req.params.id);
    if (!data) return res.status(404).json({ message: "Like not found" });
    res.json(data);
  } catch (err) { next(err); }
}

export async function create(req, res, next) {
  try {
    const data = await instaLikeModel.create(req.body);
    res.status(201).json(data);
  } catch (err) { next(err); }
}

export async function update(req, res, next) {
  try {
    const data = await instaLikeModel.update(req.params.id, req.body);
    if (!data) return res.status(404).json({ message: "Like not found" });
    res.json(data);
  } catch (err) { next(err); }
}

export async function remove(req, res, next) {
  try {
    const data = await instaLikeModel.remove(req.params.id);
    if (!data) return res.status(404).json({ message: "Like not found" });
    res.status(204).end();
  } catch (err) { next(err); }
}
