type t = Z.t

type error =
  | Negative
  | Invalid_format
  | Non_canonical_format

let zero = Z.zero
let one = Z.one

let of_z z =
  if Z.sign z < 0 then Error Negative else Ok z

let is_digit c = c >= '0' && c <= '9'

let all_digits_from s start =
  let rec loop i =
    i = String.length s || (is_digit s.[i] && loop (i + 1))
  in
  loop start

let of_string s =
  let len = String.length s in
  if len = 0 then Error Invalid_format
  else
    match s.[0] with
    | '-' -> Error Negative
    | '+' ->
        if len > 1 && all_digits_from s 1 then Error Non_canonical_format
        else Error Invalid_format
    | '0' ->
        if len = 1 then Ok zero
        else if all_digits_from s 0 then Error Non_canonical_format
        else Error Invalid_format
    | c when is_digit c ->
        if all_digits_from s 0 then Ok (Z.of_string s)
        else Error Invalid_format
    | _ -> Error Invalid_format

let succ = Z.succ
let compare = Z.compare
let equal = Z.equal
let to_z t = t
let to_string = Z.to_string
