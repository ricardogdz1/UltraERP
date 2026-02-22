using System;
using System.Drawing;
using System.Windows.Forms;
using System.Data.SqlClient;

namespace UltraERP
{
    public partial class Form1 : Form
    {
        private Label lblTitulo;
        private Label lblUsuario;
        private Label lblSenha;
        private TextBox txtUsuario;
        private TextBox txtSenha;
        private Button btnEntrar;
        private Panel painelCard;

        public Form1()
        {
            InitializeComponent();
            MontarTela();
        }

        private void MontarTela()
        {
            // --- Formulário ---
            this.Text = "UltraERP - Login";
            this.Size = new Size(500, 400);
            this.BackColor = Color.FromArgb(18, 18, 18);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedSingle;
            this.MaximizeBox = false;

            // --- Card central ---
            painelCard = new Panel();
            painelCard.Size = new Size(340, 280);
            painelCard.BackColor = Color.FromArgb(30, 30, 30);
            painelCard.Location = new Point(
                (this.ClientSize.Width - painelCard.Width) / 2,
                (this.ClientSize.Height - painelCard.Height) / 2
            );
            this.Controls.Add(painelCard);

            // --- Título ---
            lblTitulo = new Label();
            lblTitulo.Text = "UltraERP";
            lblTitulo.Font = new Font("Segoe UI", 20, FontStyle.Bold);
            lblTitulo.ForeColor = Color.FromArgb(99, 179, 237);
            lblTitulo.AutoSize = true;
            lblTitulo.Location = new Point(
                (painelCard.Width - 130) / 2, 20
            );
            painelCard.Controls.Add(lblTitulo);

            // --- Label Usuário ---
            lblUsuario = new Label();
            lblUsuario.Text = "Usuário";
            lblUsuario.Font = new Font("Segoe UI", 9);
            lblUsuario.ForeColor = Color.FromArgb(180, 180, 180);
            lblUsuario.Location = new Point(40, 90);
            lblUsuario.AutoSize = true;
            painelCard.Controls.Add(lblUsuario);

            // --- TextBox Usuário ---
            txtUsuario = new TextBox();
            txtUsuario.Size = new Size(260, 30);
            txtUsuario.Location = new Point(40, 110);
            txtUsuario.BackColor = Color.FromArgb(45, 45, 45);
            txtUsuario.ForeColor = Color.White;
            txtUsuario.BorderStyle = BorderStyle.FixedSingle;
            txtUsuario.Font = new Font("Segoe UI", 10);
            painelCard.Controls.Add(txtUsuario);

            // --- Label Senha ---
            lblSenha = new Label();
            lblSenha.Text = "Senha";
            lblSenha.Font = new Font("Segoe UI", 9);
            lblSenha.ForeColor = Color.FromArgb(180, 180, 180);
            lblSenha.Location = new Point(40, 150);
            lblSenha.AutoSize = true;
            painelCard.Controls.Add(lblSenha);

            // --- TextBox Senha ---
            txtSenha = new TextBox();
            txtSenha.Size = new Size(260, 30);
            txtSenha.Location = new Point(40, 170);
            txtSenha.BackColor = Color.FromArgb(45, 45, 45);
            txtSenha.ForeColor = Color.White;
            txtSenha.BorderStyle = BorderStyle.FixedSingle;
            txtSenha.Font = new Font("Segoe UI", 10);
            txtSenha.PasswordChar = '*';
            painelCard.Controls.Add(txtSenha);

            // --- Botão Entrar ---
            btnEntrar = new Button();
            btnEntrar.Text = "Entrar";
            btnEntrar.Size = new Size(260, 38);
            btnEntrar.Location = new Point(40, 220);
            btnEntrar.BackColor = Color.FromArgb(99, 179, 237);
            btnEntrar.ForeColor = Color.FromArgb(18, 18, 18);
            btnEntrar.FlatStyle = FlatStyle.Flat;
            btnEntrar.FlatAppearance.BorderSize = 0;
            btnEntrar.Font = new Font("Segoe UI", 10, FontStyle.Bold);
            btnEntrar.Cursor = Cursors.Hand;
            btnEntrar.Click += BtnEntrar_Click;
            painelCard.Controls.Add(btnEntrar);

            // --- Botão Cadastro ---
            Button btnCadastro = new Button();
            btnCadastro.Text = "Não tem conta? Cadastre-se";
            btnCadastro.Size = new Size(260, 25);
            btnCadastro.Location = new Point(40, 262);
            btnCadastro.BackColor = Color.Transparent;
            btnCadastro.ForeColor = Color.FromArgb(99, 179, 237);
            btnCadastro.FlatStyle = FlatStyle.Flat;
            btnCadastro.FlatAppearance.BorderSize = 0;
            btnCadastro.Font = new Font("Segoe UI", 9);
            btnCadastro.Cursor = Cursors.Hand;
            btnCadastro.Click += (s, e) => { new FormCadastro().ShowDialog(); };
            painelCard.Controls.Add(btnCadastro);
        }

        private void BtnEntrar_Click(object sender, EventArgs e)
        {
            if (txtUsuario.Text == "" || txtSenha.Text == "")
            {
                MessageBox.Show("Preencha todos os campos!");
                return;
            }

            try
            {
                using (var con = Banco.ObterConexao())
                {
                    con.Open();
                    string query = "SELECT COUNT(*) FROM Usuarios WHERE Usuario=@usuario AND Senha=@senha";
                    var cmd = new SqlCommand(query, con);
                    cmd.Parameters.AddWithValue("@usuario", txtUsuario.Text);
                    cmd.Parameters.AddWithValue("@senha", txtSenha.Text);
                    int resultado = (int)cmd.ExecuteScalar();

                    if (resultado > 0)
                        MessageBox.Show("Login efetuado com sucesso!");
                    else
                        MessageBox.Show("Usuário ou senha incorretos!");
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Erro ao conectar: " + ex.Message);
            }
        }
    }
}