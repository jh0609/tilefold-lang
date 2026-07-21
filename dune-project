(lang dune 3.11)

(name tilefold)

(generate_opam_files true)

(source
 (github tilefold-lang/tilefold-lang))

(authors "Tilefold contributors")

(maintainers "Tilefold contributors")

(license "UNLICENSED")

(package
 (name tilefold)
 (synopsis "Tilefold Reference Engine")
 (description
  "OCaml reference engine for the Tilefold visual programming language.")
 (depends
  (ocaml (>= 5.1))
  (dune (>= 3.11))))
