let () =
  let mode = if Array.length Sys.argv > 1 then Sys.argv.(1) else "transparent" in
  print_endline
    (Tilefold.Project_execution.run_json_with_mode (In_channel.input_all stdin)
       ~mode)
