let () =
  print_endline (Tilefold.Project_execution.run_json (In_channel.input_all stdin))
