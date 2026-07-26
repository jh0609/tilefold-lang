module E = Tilefold.Project_execution

let read_file path =
  let channel = open_in_bin path in
  Fun.protect
    ~finally:(fun () -> close_in channel)
    (fun () -> really_input_string channel (in_channel_length channel))

let member name json = Yojson.Safe.Util.member name json

let () =
  let completed =
    read_file "../examples/nat-succ.tilefold.json" |> E.run_json
    |> Yojson.Safe.from_string
  in
  assert (member "status" completed = `String "completed");
  assert (member "result" completed = `String "Nat(3)");
  assert (member "rewriteCount" completed = `Int 5);
  let malformed = E.run_json "{" |> Yojson.Safe.from_string in
  assert (member "status" malformed = `String "error");
  assert (member "stage" malformed = `String "decode")
