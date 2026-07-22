type t =
  | Unit
  | Nat
  | Arrow of t * t

let equal = ( = )
let compare = Stdlib.compare

let rec to_string_prec parent_prec typ =
  match typ with
  | Unit -> "Unit"
  | Nat -> "Nat"
  | Arrow (input, output) ->
      let prec = 1 in
      let text =
        to_string_prec 2 input ^ " -> " ^ to_string_prec 1 output
      in
      if prec < parent_prec then "(" ^ text ^ ")" else text

let to_string typ = to_string_prec 0 typ
