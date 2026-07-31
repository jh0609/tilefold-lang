type t =
  | Unit
  | Bool
  | Nat
  | Product of t * t
  | Sum of t * t
  | Arrow of t * t

let equal = ( = )
let compare = Stdlib.compare

let rec to_string_prec parent_prec typ =
  match typ with
  | Unit -> "Unit"
  | Bool -> "Bool"
  | Nat -> "Nat"
  | Product (left, right) ->
      let prec = 3 in
      let text = to_string_prec 4 left ^ " * " ^ to_string_prec 3 right in
      if prec < parent_prec then "(" ^ text ^ ")" else text
  | Sum (left, right) ->
      let prec = 2 in
      let text = to_string_prec 3 left ^ " + " ^ to_string_prec 2 right in
      if prec < parent_prec then "(" ^ text ^ ")" else text
  | Arrow (input, output) ->
      let prec = 1 in
      let text = to_string_prec 2 input ^ " -> " ^ to_string_prec 1 output in
      if prec < parent_prec then "(" ^ text ^ ")" else text

let to_string typ = to_string_prec 0 typ
