type t =
  | Unit
  | Bool
  | Nat
  | Arrow of t * t

val equal : t -> t -> bool
val compare : t -> t -> int
val to_string : t -> string
