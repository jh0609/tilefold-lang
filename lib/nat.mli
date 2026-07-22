type t

type error =
  | Negative
  | Invalid_format
  | Non_canonical_format

val zero : t
val one : t
val of_z : Z.t -> (t, error) result
val of_string : string -> (t, error) result
val succ : t -> t
val compare : t -> t -> int
val equal : t -> t -> bool
val to_z : t -> Z.t
val to_string : t -> string
