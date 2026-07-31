type t =
  | Unit
  | Bool
  | Nat
  | Product of t * t
  | Sum of t * t
  | List of t
  | Arrow of t * t

val equal : t -> t -> bool
val compare : t -> t -> int
val to_string : t -> string
