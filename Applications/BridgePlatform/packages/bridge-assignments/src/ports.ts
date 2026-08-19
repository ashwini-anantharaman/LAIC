// What the HOST must supply. These are the seams that keep this a component
// rather than a folder of moved files.
//
// The actions are server actions and therefore have to live in the app (they
// need "use server", the request context and the stores). The components receive
// them as props and only ever render forms around them, so the package holds no
// authorization of its own — every mutation is re-checked where it runs.

/** A person the host offers in a picker. */
export interface PickablePerson {
  id: string;
  name: string;
  /** Quiet right-hand detail on the row ("4 learners"). */
  detail?: string;
}

/**
 * The mutations an assignment surface can trigger. Each takes a FormData so the
 * host can implement them as plain server actions with no client JavaScript.
 */
export interface AssignmentActions {
  /** Give a legacy group a brief so it can hold reviewers at all. */
  adopt: (formData: FormData) => void | Promise<void>;
  saveNote: (formData: FormData) => void | Promise<void>;
  addLearner: (formData: FormData) => void | Promise<void>;
  removeLearner: (formData: FormData) => void | Promise<void>;
  addReviewer: (formData: FormData) => void | Promise<void>;
  removeReviewer: (formData: FormData) => void | Promise<void>;
  /** Retire the whole assignment — brief and every learner's row. Detach,
   *  never destroy: played games and their feedback are left standing. */
  deleteAssignment: (formData: FormData) => void | Promise<void>;
}

/** Where the surfaces link to. Paths belong to the host's routing, not here. */
export interface AssignmentLinks {
  /** The list the editor closes back to. */
  list: string;
  /** One review thread. */
  thread: (submissionId: string) => string;
  /** The board behind the assignment ("open the board"). */
  board: (entryId: string) => string;
}

/** The banner a mutation left behind, if any. */
export interface AssignmentFlash {
  added?: string;
  removed?: string;
  saved?: string;
  sent?: string;
  error?: string;
}
