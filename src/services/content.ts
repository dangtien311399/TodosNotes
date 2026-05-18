import * as todosRepo from "../repositories/todos.js";
import * as notesRepo from "../repositories/notes.js";

export const listTodosByUser = todosRepo.listTodosByUser;
export const getTodoById = todosRepo.getTodoById;
export const deleteTodo = todosRepo.softDeleteTodo;

// Admin view: trả flat list (không cursor) — phục vụ trang user detail
export const listNotesByUser = async (
  userId: string,
  limit = 200
): Promise<notesRepo.NoteRow[]> => {
  const res = await notesRepo.listNotesByUser(userId, { limit });
  return res.rows;
};

export const getNoteById = notesRepo.getNoteById;
export const deleteNote = (id: string): Promise<boolean> =>
  notesRepo.softDeleteNote(id);
