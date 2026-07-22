open Tilefold

let expect_ok = function
  | Ok value -> value
  | Error _ -> assert false

let expect_error expected = function
  | Ok _ -> assert false
  | Error actual -> assert (actual = expected)

let () =
  assert (Nat.to_string Nat.zero = "0");
  assert (Nat.to_string Nat.one = "1");

  assert (Nat.equal (expect_ok (Nat.of_z Z.zero)) Nat.zero);

  let large_z = Z.pow (Z.of_int 2) 200 in
  let large_nat = expect_ok (Nat.of_z large_z) in
  assert (Z.equal (Nat.to_z large_nat) large_z);

  expect_error Nat.Negative (Nat.of_z (Z.minus_one));

  assert (Nat.equal (Nat.succ Nat.zero) Nat.one);

  let above_max_int = expect_ok (Nat.of_string (string_of_int max_int)) in
  let above_max_int_succ = Nat.succ above_max_int in
  assert (Nat.to_string above_max_int_succ = Z.to_string (Z.succ (Z.of_int max_int)));

  let huge_decimal =
    "123456789012345678901234567890123456789012345678901234567890"
  in
  let huge_nat = expect_ok (Nat.of_string huge_decimal) in
  assert (Nat.to_string huge_nat = huge_decimal);

  assert (Nat.to_string (expect_ok (Nat.of_string "42")) = "42");

  expect_error Nat.Non_canonical_format (Nat.of_string "0042");
  expect_error Nat.Non_canonical_format (Nat.of_string "+42");
  expect_error Nat.Negative (Nat.of_string "-1");
  expect_error Nat.Invalid_format (Nat.of_string " 42");
  expect_error Nat.Invalid_format (Nat.of_string "4_2");
  expect_error Nat.Invalid_format (Nat.of_string "");

  let forty_one = expect_ok (Nat.of_string "41") in
  let forty_two = expect_ok (Nat.of_string "42") in
  let forty_two_again = expect_ok (Nat.of_string "42") in
  assert (Nat.compare forty_one forty_two < 0);
  assert (Nat.compare forty_two forty_one > 0);
  assert (Nat.compare forty_two forty_two_again = 0);
  assert (Nat.equal forty_two forty_two_again);
  assert (not (Nat.equal forty_one forty_two));
  assert (Z.sign (Nat.to_z forty_two) >= 0)
