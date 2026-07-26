open Js_of_ocaml

let () =
  Js.export "TilefoldRunner"
    (object%js
       method runProjectJson project_json =
         project_json |> Js.to_string |> Tilefold.Project_execution.run_json
         |> Js.string
    end)
